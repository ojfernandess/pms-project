import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchemaReadinessService } from "../prisma/schema-readiness.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { Catalog, QueryRequest, columnTypeFromUdt, compileQuery, parseSelect } from "./query-compiler";

const RPCS = new Set([
  "apply_financial_ar_migration",
  "apply_recommendation_price",
  "approve_accounts_payable",
  "backfill_settlement_cash_flow",
  "calculate_category_availability",
  "calculate_rate_price",
  "cancel_expired_preregistrations",
  "complete_web_checkin_by_token",
  "cancel_expired_quote",
  "company_has_feature_access",
  "create_guest_account",
  "create_notification",
  "create_notification_for_establishment",
  "create_reservation_with_lock",
  "crm_enqueue_outbox",
  "crm_ensure_default_pipeline",
  "crm_upsert_abandoned_lead",
  "crm_upsert_contact_from_client",
  "crm_upsert_deal_from_quote",
  "deactivate_guest_account",
  "debug_expired_preregistrations",
  "generate_rate_recommendations",
  "get_checkin_charge_by_payment_token",
  "get_company_api_credentials_status",
  "get_company_api_request_logs",
  "get_fnrh_guest_form_visibility",
  "get_financial_cash_flow_report",
  "get_fnrh_settings_public",
  "get_resolved_email_template",
  "preview_financial_ar_migration",
  "insert_email_queue",
  "is_date_available_for_sale",
  "log_activity",
  "merge_duplicate_clients_into_primary",
  "process_no_shows",
  "reallocate_reservation",
  "register_payable_settlement",
  "register_receivable_settlement",
  "register_receivable_settlement_batch",
  "reject_accounts_payable",
  "request_guest_password_reset",
  "reset_guest_password",
  "rotate_company_api_credentials",
  "set_company_api_credentials_active",
  "spawn_due_recurring_payables",
  "sync_rate_inventory_from_reservations",
  "test_expired_preregistrations",
  "update_guest_password",
  "update_reservation_notes_for_guest",
  "upsert_fnrh_settings",
  "validate_and_apply_discount",
  "verify_guest_password",
  "verify_web_checkin_guest_access",
]);

type QueryResult = { data: unknown; error: { message: string; code?: string } | null; count: number | null };

class TxConcurrencyGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);
  private catalog: Promise<Catalog> | null = null;
  private readonly missingTableWarned = new Set<string>();
  private readonly txGate = new TxConcurrencyGate(
    Math.max(1, Number(process.env.PMS_DB_MAX_CONCURRENT_TX ?? 12)),
  );
  private readonly txMaxWaitMs = Math.max(5000, Number(process.env.PMS_TX_MAX_WAIT_MS ?? 45_000));
  private readonly txTimeoutMs = Math.max(10_000, Number(process.env.PMS_TX_TIMEOUT_MS ?? 120_000));

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly schemaReadiness: SchemaReadinessService,
  ) {}

  async query(request: QueryRequest, user: SessionUser | null): Promise<QueryResult> {
    try {
      const catalog = await this.loadCatalog();
      const compiled = compileQuery(request, catalog);
      const rows = await this.withRole(user, async (tx) => {
        if (request.head) {
          const countRows = await tx.$queryRawUnsafe<{ count: number }[]>(compiled.sql, ...compiled.values);
          return { data: null, count: Number(countRows[0]?.count ?? 0), records: [] as Record<string, unknown>[] };
        }
        const records = unwrap(await tx.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(compiled.sql, ...compiled.values));
        let count: number | null = null;
        if (compiled.countSql) {
          const countRows = await tx.$queryRawUnsafe<{ count: number }[]>(compiled.countSql, ...compiled.values);
          count = Number(countRows[0]?.count ?? 0);
        }
        return { data: records, count, records };
      });
      if (request.head) return { data: null, error: null, count: rows.count };
      let records = rows.records;
      if (request.action !== "select" && request.select && parseSelect(request.select).some((field) => field.kind === "embed")) {
        const ids = records.map((row) => row.id).filter((id): id is string => typeof id === "string");
        if (ids.length > 0) {
          const again = await this.query({ action: "select", table: request.table, select: request.select, filters: [{ column: "id", op: "in", value: ids }] }, user);
          if (again.error) return again;
          records = Array.isArray(again.data) ? again.data as Record<string, unknown>[] : [];
        }
      } else if (request.action !== "select") {
        records = shapeMutation(records, request.select);
      }
      if (request.action !== "select") {
        const event = request.action === "delete" ? "DELETE" : request.action === "update" ? "UPDATE" : "INSERT";
        for (const row of records) this.realtime.publish({ table: request.table, event, row });
      }
      if (request.single) {
        if (records.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count: rows.count };
        return { data: records[0], error: null, count: rows.count };
      }
      if (request.maybeSingle) {
        if (records.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count: rows.count };
        return { data: records[0] ?? null, error: null, count: rows.count };
      }
      return { data: request.head ? null : records, error: null, count: rows.count };
    } catch (error) {
      let message = error instanceof Error ? error.message : "Erro na consulta";
      if (/Unable to start a transaction in the given time/i.test(message)) {
        message =
          "Banco ocupado: não foi possível abrir transação a tempo. Tente novamente em alguns segundos ou aumente connection_limit / PMS_DB_MAX_CONCURRENT_TX no servidor.";
      }
      this.logQueryFailure(message);
      return { data: null, error: { message }, count: null };
    }
  }

  async rpc(name: string, args: Record<string, unknown> | null, user: SessionUser | null): Promise<QueryResult> {
    if (!RPCS.has(name)) return { data: null, error: { message: `Função não disponível: ${name}` }, count: null };
    try {
      const data = await this.withRole(user, async (tx) => {
        const signatures = await tx.$queryRaw<{ args: string; retset: boolean; ret: string }[]>`
          SELECT pg_get_function_identity_arguments(p.oid) AS args,
                 p.proretset AS retset,
                 format_type(p.prorettype, NULL) AS ret
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = ${name}
        `;
        if (signatures.length === 0) throw new Error(`Função não encontrada: ${name}`);
        const input = args ?? {};
        const signature =
          signatures.find((item) => Object.keys(input).every((key) => argNames(item.args).includes(key))) ??
          signatures[0];
        const { entries, values } = resolveRpcInvocation(signature.args, input);
        const types = argTypeMap(signature.args);
        const positional = entries
          .map((key, index) => {
            const pgType = pgCastType(types.get(key) ?? "text");
            return `$${index + 1}::${pgType}`;
          })
          .join(", ");
        const call =
          entries.length === 0 ? `public.${quoteArg(name)}()` : `public.${quoteArg(name)}(${positional})`;
        const retType = (signature.ret ?? "").toLowerCase();
        if (retType === "void") {
          await tx.$executeRawUnsafe(`SELECT ${call}`, ...values);
          return null;
        }
        if (signature.retset) {
          const rows = await tx.$queryRawUnsafe<{ data: unknown }[]>(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS data FROM ${call} t`, ...values);
          return rows[0]?.data ?? [];
        }
        const rows = await tx.$queryRawUnsafe<{ data: unknown }[]>(`SELECT to_jsonb(${call}) AS data`, ...values);
        return rows[0]?.data ?? null;
      });
      return { data, error: null, count: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro na função";
      this.logger.warn(message);
      return { data: null, error: { message }, count: null };
    }
  }

  private resolveDbRole(user: SessionUser | null): string {
    const override = process.env.PMS_DB_QUERY_ROLE?.trim().toLowerCase();
    if (override === "authenticated" || override === "anon" || override === "service_role") {
      return override;
    }
    return user ? "authenticated" : "anon";
  }

  private async withRole<T>(user: SessionUser | null, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const jwtRole = user ? "authenticated" : "anon";
    const dbRole = this.resolveDbRole(user);
    const claims = JSON.stringify({ sub: user?.id, email: user?.email, role: jwtRole, aud: jwtRole });
    await this.txGate.acquire();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${claims}, true)`;
          await tx.$executeRaw`SELECT set_config('request.jwt.claim.sub', ${user?.id ?? ""}, true)`;
          await tx.$executeRaw`SELECT set_config('request.jwt.claim.role', ${jwtRole}, true)`;
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${dbRole}`);
          return run(tx);
        },
        { maxWait: this.txMaxWaitMs, timeout: this.txTimeoutMs },
      );
    } finally {
      this.txGate.release();
    }
  }

  private logQueryFailure(message: string): void {
    const missing = /^Tabela não encontrada: (.+)$/.exec(message);
    if (missing && !this.schemaReadiness.schemaReady) {
      const table = missing[1];
      if (!this.missingTableWarned.has(table)) {
        this.missingTableWarned.add(table);
        this.logger.warn(
          `${message} — Postgres sem schema PMS; restaure dump/migracoes. Avisos repetidos desta tabela suprimidos.`,
        );
      }
      return;
    }
    this.logger.warn(message);
  }

  /** Após DDL incremental (ex. novas colunas em companies), recarrega information_schema. */
  invalidateCatalog(): void {
    this.catalog = null;
  }

  private loadCatalog(): Promise<Catalog> {
    if (!this.catalog) {
      this.catalog = this.readCatalog().catch((error) => {
        this.catalog = null;
        throw error;
      });
    }
    return this.catalog;
  }

  private async readCatalog(): Promise<Catalog> {
    const [types, fks] = await Promise.all([
      this.prisma.$queryRaw<{ table_name: string; column_name: string; udt_name: string }[]>`
        SELECT table_name, column_name, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `,
      this.prisma.$queryRaw<{ constraint: string; table_name: string; column_name: string; foreign_table: string; foreign_column: string; singular: boolean }[]>`
        SELECT c.conname AS constraint,
               src.relname AS table_name,
               src_att.attname AS column_name,
               dst.relname AS foreign_table,
               dst_att.attname AS foreign_column,
               EXISTS (
                 SELECT 1 FROM pg_index i
                 WHERE i.indrelid = c.conrelid AND i.indisunique AND i.indnkeyatts = 1 AND i.indkey[0] = c.conkey[1]
               ) AS singular
        FROM pg_constraint c
        JOIN pg_class src ON src.oid = c.conrelid
        JOIN pg_namespace ns ON ns.oid = src.relnamespace
        JOIN pg_class dst ON dst.oid = c.confrelid
        JOIN pg_attribute src_att ON src_att.attrelid = c.conrelid AND src_att.attnum = c.conkey[1]
        JOIN pg_attribute dst_att ON dst_att.attrelid = c.confrelid AND dst_att.attnum = c.confkey[1]
        WHERE c.contype = 'f' AND ns.nspname = 'public' AND array_length(c.conkey, 1) = 1
      `,
    ]);
    const mapped: Catalog["types"] = {};
    for (const column of types) {
      mapped[column.table_name] ??= {};
      mapped[column.table_name][column.column_name] = columnTypeFromUdt(column.udt_name);
    }
    return {
      types: mapped,
      fks: fks.map((fk) => ({
        constraint: fk.constraint,
        table: fk.table_name,
        column: fk.column_name,
        foreignTable: fk.foreign_table,
        foreignColumn: fk.foreign_column,
        singular: fk.singular,
      })),
    };
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function argNames(args: string): string[] {
  return args.split(",").map((part) => part.trim().split(/\s+/)[0]).filter((part) => IDENT.test(part));
}

function argTypeMap(args: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of args.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
    if (match && IDENT.test(match[1])) {
      map.set(match[1], match[2]);
    } else if (/^[a-z][\w\[\]]*$/i.test(trimmed)) {
      map.set(trimmed, trimmed);
    }
  }
  return map;
}

/** Aceita nomes do cliente (ex. p_company_id) quando o PG só expõe o tipo (ex. uuid). */
function resolveRpcInvocation(
  signatureArgs: string,
  input: Record<string, unknown>,
): { entries: string[]; values: unknown[] } {
  const known = argNames(signatureArgs);
  const namedEntries = known.filter((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (namedEntries.length > 0 || Object.keys(input).length === 0) {
    return { entries: namedEntries, values: namedEntries.map((key) => input[key]) };
  }

  const inputKeys = Object.keys(input);
  const typeParts = signatureArgs
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (typeParts.length !== inputKeys.length) {
    throw new Error(`Argumento desconhecido: ${inputKeys[0] ?? ""}`);
  }

  const entries = typeParts.map((part) => {
    const match = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
    if (match && IDENT.test(match[1])) return match[1];
    const tokens = part.split(/\s+/);
    return tokens[tokens.length - 1];
  });
  const values = inputKeys.length === 1 ? [input[inputKeys[0]]] : inputKeys.map((key) => input[key]);
  return { entries, values };
}

/** Tipos de argumentos vindos de pg_get_function_identity_arguments (ex.: uuid, date). */
function pgCastType(pgType: string): string {
  const t = pgType.trim();
  if (!/^[\w\s\[\]()]+$/i.test(t)) return "text";
  return t;
}

function quoteArg(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Identificador inválido: ${name}`);
  return `"${name}"`;
}

function unwrap(rows: { row: Record<string, unknown> }[]): Record<string, unknown>[] {
  return rows.map((row) => row.row).filter((row) => row && typeof row === "object");
}

function shapeMutation(rows: Record<string, unknown>[], select: string | null | undefined): Record<string, unknown>[] {
  if (!select) return rows;
  const fields = parseSelect(select);
  if (fields.some((field) => field.kind === "star" || field.kind === "embed")) return rows;
  const names = fields.filter((field): field is { kind: "column"; name: string } => field.kind === "column").map((field) => field.name);
  return rows.map((row) => Object.fromEntries(names.map((name) => [name, row[name]])));
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type SqlType = "uuid" | "number" | "boolean" | "date" | "time" | "json" | "text";

/** Tipo de coluna no catálogo; enums Postgres usam cast explícito ($1::reservation_status). */
export type ColumnType = SqlType | { kind: "enum"; name: string };

const PG_SCALAR_UDT = new Set([
  "uuid",
  "bool",
  "int2",
  "int4",
  "int8",
  "numeric",
  "float4",
  "float8",
  "text",
  "varchar",
  "bpchar",
  "date",
  "timestamp",
  "timestamptz",
  "json",
  "jsonb",
]);

export function columnTypeFromUdt(udt: string): ColumnType {
  if (udt === "uuid") return "uuid";
  if (udt === "bool") return "boolean";
  if (udt === "date") return "date";
  if (udt === "json" || udt === "jsonb") return "json";
  if (udt === "timestamp" || udt === "timestamptz") return "time";
  if (["int2", "int4", "int8", "numeric", "float4", "float8"].includes(udt)) return "number";
  if (udt === "text" || udt === "varchar" || udt === "bpchar") return "text";
  if (udt.startsWith("_") || PG_SCALAR_UDT.has(udt)) return "text";
  return { kind: "enum", name: udt };
}

export type ForeignKey = {
  constraint: string;
  table: string;
  column: string;
  foreignTable: string;
  foreignColumn: string;
  singular: boolean;
};

export type Catalog = {
  fks: ForeignKey[];
  types: Record<string, Record<string, ColumnType>>;
};

export type SelectField =
  | { kind: "star" }
  | { kind: "column"; name: string }
  | { kind: "embed"; key: string; target: string; hint?: string; inner: boolean; fields: SelectField[] };

export type Logic =
  | { kind: "cmp"; column: string; op: string; value: unknown }
  | { kind: "and"; items: Logic[] }
  | { kind: "or"; items: Logic[] };

export type QueryRequest = {
  action: "select" | "insert" | "update" | "delete" | "upsert";
  table: string;
  select?: string | null;
  filters?: { column: string; op: string; value: unknown }[];
  or?: string[];
  order?: { column: string; ascending?: boolean; nullsFirst?: boolean }[];
  limit?: number | null;
  offset?: number | null;
  values?: Record<string, unknown> | Record<string, unknown>[] | null;
  onConflict?: string | null;
  count?: "exact" | null;
  head?: boolean;
  single?: boolean;
  maybeSingle?: boolean;
};

export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Identificador inválido: ${name}`);
  return `"${name}"`;
}

export function parseSelect(input: string | null | undefined): SelectField[] {
  const src = (input ?? "*").trim();
  if (!src || src === "*") return [{ kind: "star" }];
  return parseFieldList(src);
}

export function parseOr(input: string): Logic {
  return { kind: "or", items: parseLogicList(input.trim()) };
}

export function compileQuery(request: QueryRequest, catalog: Catalog): { sql: string; countSql: string | null; values: unknown[] } {
  const table = request.table;
  if (!catalog.types[table]) throw new Error(`Tabela não encontrada: ${table}`);
  if (request.action === "select") return compileSelect(request, catalog);
  return { ...compileMutation(request, catalog), countSql: null };
}

function compileSelect(request: QueryRequest, catalog: Catalog): { sql: string; countSql: string | null; values: unknown[] } {
  const values: unknown[] = [];
  const fields = parseSelect(request.select);
  const { expr, extraWhere } = projection("t", request.table, fields, catalog, values);
  const where = whereSql(request, catalog, values, extraWhere);
  const countValues = values.slice();
  const countSql = request.count === "exact" ? `SELECT count(*)::int AS count FROM ${quoteIdent(request.table)} t${where}` : null;
  if (request.head) return { sql: countSql ?? `SELECT 0::int AS count`, countSql, values: countValues };
  const order = orderSql(request.order);
  const limit = clampLimit(request.limit);
  const offset = clampOffset(request.offset);
  const sql = `SELECT ${expr} AS row FROM ${quoteIdent(request.table)} t${where}${order} LIMIT ${limit} OFFSET ${offset}`;
  return { sql, countSql, values };
}

function compileMutation(request: QueryRequest, catalog: Catalog): { sql: string; values: unknown[] } {
  const table = request.table;
  const types = catalog.types[table];
  const values: unknown[] = [];
  if (request.action === "insert" || request.action === "upsert") {
    const rows = asRows(request.values);
    if (rows.length === 0) throw new Error("Nada para gravar");
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    if (columns.length === 0) throw new Error("Nada para gravar");
    for (const column of columns) {
      if (!types[column]) throw new Error(`Coluna não encontrada: ${table}.${column}`);
    }
    const tuples = rows.map((row) => `(${columns.map((column) => bind(values, row[column] ?? null, types[column])).join(", ")})`);
    let conflict = "";
    if (request.action === "upsert") {
      const keys = (request.onConflict || "id").split(",").map((item) => item.trim()).filter(Boolean);
      if (keys.length === 0) throw new Error("onConflict vazio");
      for (const key of keys) {
        if (!types[key]) throw new Error(`Coluna não encontrada: ${table}.${key}`);
      }
      const updates = columns.filter((column) => !keys.includes(column));
      const setSql = updates.length
        ? updates.map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`).join(", ")
        : keys.map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`).join(", ");
      conflict = ` ON CONFLICT (${keys.map(quoteIdent).join(", ")}) DO UPDATE SET ${setSql}`;
    }
    const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES ${tuples.join(", ")}${conflict} RETURNING to_jsonb(${quoteIdent(table)}) AS row`;
    return { sql, values };
  }
  if ((request.filters ?? []).length === 0 && (request.or ?? []).length === 0) {
    throw new Error(`${request.action} sem filtro`);
  }
  const where = whereSql(request, catalog, values, []);
  if (request.action === "delete") {
    return { sql: `DELETE FROM ${quoteIdent(table)} AS t${where} RETURNING to_jsonb(t) AS row`, values };
  }
  const patch = asRows(request.values)[0];
  if (!patch) throw new Error("Nada para atualizar");
  const assignments = Object.entries(patch).map(([column, value]) => {
    if (!types[column]) throw new Error(`Coluna não encontrada: ${table}.${column}`);
    return `${quoteIdent(column)} = ${bind(values, value, types[column])}`;
  });
  if (assignments.length === 0) throw new Error("Nada para atualizar");
  return { sql: `UPDATE ${quoteIdent(table)} AS t SET ${assignments.join(", ")}${where} RETURNING to_jsonb(t) AS row`, values };
}

function projection(alias: string, table: string, fields: SelectField[], catalog: Catalog, values: unknown[]): { expr: string; extraWhere: string[] } {
  const extraWhere: string[] = [];
  const stars = fields.some((field) => field.kind === "star");
  const columns = fields.filter((field): field is { kind: "column"; name: string } => field.kind === "column");
  const embeds = fields.filter((field): field is Extract<SelectField, { kind: "embed" }> => field.kind === "embed");
  const embedSql = embeds.map((field) => {
    const built = embedExpression(alias, table, field, catalog, values);
    if (built.exists) extraWhere.push(built.exists);
    return `'${field.key}', ${built.sql}`;
  });
  if (stars || columns.length === 0) {
    const expr = embedSql.length === 0 ? `to_jsonb(${alias})` : `(to_jsonb(${alias}) || jsonb_build_object(${embedSql.join(", ")}))`;
    return { expr, extraWhere };
  }
  for (const column of columns) {
    if (!catalog.types[table]?.[column.name]) throw new Error(`Coluna não encontrada: ${table}.${column.name}`);
  }
  const pairs = [
    ...columns.map((column) => `'${column.name}', ${alias}.${quoteIdent(column.name)}`),
    ...embedSql,
  ];
  return { expr: `jsonb_build_object(${pairs.join(", ")})`, extraWhere };
}

function embedExpression(parentAlias: string, parentTable: string, field: Extract<SelectField, { kind: "embed" }>, catalog: Catalog, values: unknown[]): { sql: string; exists: string | null } {
  const link = resolveLink(parentTable, field.target, field.hint, catalog.fks, catalog.types);
  const childAlias = `e${values.length}_${parentAlias.replace(/\W/g, "")}`;
  const projected = projection(childAlias, link.childTable, field.fields, catalog, values);
  const where = `${link.where(parentAlias, childAlias)}${projected.extraWhere.length ? ` AND ${projected.extraWhere.join(" AND ")}` : ""}`;
  const from = `${quoteIdent(link.childTable)} ${childAlias}`;
  const exists = field.inner ? `EXISTS (SELECT 1 FROM ${from} WHERE ${where})` : null;
  if (link.singular) {
    return { sql: `(SELECT ${projected.expr} FROM ${from} WHERE ${where})`, exists };
  }
  return { sql: `(SELECT COALESCE(jsonb_agg(${projected.expr}), '[]'::jsonb) FROM ${from} WHERE ${where})`, exists };
}

type Link = {
  childTable: string;
  singular: boolean;
  where: (parentAlias: string, childAlias: string) => string;
};

/** Colunas FK mais usadas nos selects do front (quando pg_constraint ainda não foi restaurado). */
const EMBED_COLUMN_BY_TARGET: Record<string, string[]> = {
  room_categories: ["category_id"],
  pricing_plans: ["pricing_plan_id"],
  rooms: ["room_id"],
  clients: ["client_id", "guest_id"],
  pricing_seasons: ["season_id"],
};

function singularLink(childTable: string, parentColumn: string, childColumn = "id"): Link {
  return {
    childTable,
    singular: true,
    where: (parent, child) => `${parent}.${quoteIdent(parentColumn)} = ${child}.${quoteIdent(childColumn)}`,
  };
}

function inferLinkFromColumns(
  parentTable: string,
  target: string,
  hint: string | undefined,
  types: Record<string, Record<string, ColumnType>> | undefined,
): Link | null {
  const cols = types?.[parentTable];
  if (!cols) return null;
  if (hint && cols[hint]) return singularLink(target, hint);
  const guessed = [
    ...(EMBED_COLUMN_BY_TARGET[target] ?? []),
    target.endsWith("s") && !target.endsWith("ss") ? `${target.slice(0, -1)}_id` : `${target}_id`,
  ];
  const matches = [...new Set(guessed)].filter((col) => cols[col]);
  if (matches.length === 1) return singularLink(target, matches[0]);
  return null;
}

export function resolveLink(
  parentTable: string,
  target: string,
  hint: string | undefined,
  fks: ForeignKey[],
  types?: Record<string, Record<string, ColumnType>>,
): Link {
  const hinted = (fk: ForeignKey) => !hint || fk.constraint === hint || fk.column === hint;
  const fromParent = fks.filter((fk) => fk.table === parentTable && hinted(fk) && (fk.foreignTable === target || fk.column === target || fk.constraint === target));
  const fromChild = fks.filter((fk) => fk.foreignTable === parentTable && hinted(fk) && (fk.table === target || fk.constraint === target));
  if (fromParent.length === 1 && fromChild.length === 0) {
    const fk = fromParent[0];
    return {
      childTable: fk.foreignTable,
      singular: true,
      where: (parent, child) => `${parent}.${quoteIdent(fk.column)} = ${child}.${quoteIdent(fk.foreignColumn)}`,
    };
  }
  if (fromChild.length === 1 && fromParent.length === 0) {
    const fk = fromChild[0];
    return {
      childTable: fk.table,
      singular: fk.singular,
      where: (parent, child) => `${child}.${quoteIdent(fk.column)} = ${parent}.${quoteIdent(fk.foreignColumn)}`,
    };
  }
  if (fromParent.length === 1 && fromChild.length > 0 && fromParent[0].foreignTable === target) {
    const fk = fromParent[0];
    return {
      childTable: fk.foreignTable,
      singular: true,
      where: (parent, child) => `${parent}.${quoteIdent(fk.column)} = ${child}.${quoteIdent(fk.foreignColumn)}`,
    };
  }
  const inferred = inferLinkFromColumns(parentTable, target, hint, types);
  if (inferred) return inferred;
  throw new Error(`Relação ambígua ou inexistente: ${parentTable} -> ${target}`);
}

function whereSql(request: QueryRequest, catalog: Catalog, values: unknown[], extra: string[]): string {
  const parts = [...extra];
  for (const filter of request.filters ?? []) {
    parts.push(logicSql({ kind: "cmp", column: filter.column, op: filter.op, value: filter.value }, request.table, catalog, values));
  }
  for (const group of request.or ?? []) {
    parts.push(logicSql(parseOr(group), request.table, catalog, values));
  }
  if (parts.length === 0) return "";
  return ` WHERE ${parts.join(" AND ")}`;
}

function logicSql(node: Logic, table: string, catalog: Catalog, values: unknown[]): string {
  if (node.kind === "cmp") return compare(table, "t", node.column, node.op, node.value, catalog, values);
  if (node.items.length === 0) return node.kind === "or" ? "FALSE" : "TRUE";
  const joiner = node.kind === "or" ? " OR " : " AND ";
  return `(${node.items.map((item) => logicSql(item, table, catalog, values)).join(joiner)})`;
}

function compare(table: string, alias: string, column: string, op: string, value: unknown, catalog: Catalog, values: unknown[]): string {
  if (column.includes(".")) {
    const [relation, childColumn, extra] = column.split(".");
    if (!relation || !childColumn || extra) throw new Error(`Filtro inválido: ${column}`);
    const link = resolveLink(table, relation, undefined, catalog.fks, catalog.types);
    const childAlias = "c";
    const inner = compare(link.childTable, childAlias, childColumn, op, value, catalog, values).replaceAll(`${childAlias}.`, `${childAlias}.`);
    return `EXISTS (SELECT 1 FROM ${quoteIdent(link.childTable)} ${childAlias} WHERE ${link.where(alias, childAlias)} AND ${inner})`;
  }
  quoteIdent(column);
  const type = catalog.types[table]?.[column] ?? "text";
  const ref = `${alias}.${quoteIdent(column)}`;
  if (op === "is" || op === "not.is") {
    if (value === null || value === "null") return op === "is" ? `${ref} IS NULL` : `${ref} IS NOT NULL`;
    const placeholder = bind(values, value === true || value === "true", "boolean");
    return op === "is" ? `${ref} IS ${placeholder}` : `${ref} IS DISTINCT FROM ${placeholder}`;
  }
  if (op === "in" || op === "not.in") {
    const list = Array.isArray(value) ? value : parseInList(String(value));
    if (list.length === 0) return op === "in" ? "FALSE" : "TRUE";
    const placeholder = bindArray(values, list, type);
    const expr = `${ref} = ANY(${placeholder})`;
    return op === "in" ? expr : `NOT (${expr})`;
  }
  if (op === "like" || op === "ilike" || op === "not.like" || op === "not.ilike") {
    const placeholder = bind(values, value, "text");
    const expr = `${ref}::text ${op.includes("ilike") ? "ILIKE" : "LIKE"} ${placeholder}`;
    return op.startsWith("not.") ? `NOT (${expr})` : expr;
  }
  if (op === "cs" || op === "cd" || op === "ov") {
    const placeholder = bind(values, typeof value === "string" ? value : JSON.stringify(value), "json");
    const operator = op === "cs" ? "@>" : op === "cd" ? "<@" : "&&";
    return `${ref} ${operator} ${placeholder}`;
  }
  if ((op === "eq" || op === "not.eq" || op === "neq") && (value === null || value === "null")) {
    return op === "eq" ? `${ref} IS NULL` : `${ref} IS NOT NULL`;
  }
  const placeholder = bind(values, value, type);
  if (op === "not.eq" || op === "neq") return `${ref} IS DISTINCT FROM ${placeholder}`;
  const symbol = op === "eq" ? "=" : op === "gt" ? ">" : op === "gte" ? ">=" : op === "lt" ? "<" : op === "lte" ? "<=" : "";
  if (!symbol) throw new Error(`Operador não suportado: ${op}`);
  return `${ref} ${symbol} ${placeholder}`;
}

function bind(values: unknown[], value: unknown, type: ColumnType): string {
  const index = values.length + 1;
  if (value === null || value === undefined) return "NULL";
  if (typeof type === "object" && type.kind === "enum") {
    values.push(String(value));
    return `$${index}::${quoteIdent(type.name)}`;
  }
  if (type === "json") {
    values.push(typeof value === "string" ? value : JSON.stringify(value));
    return `$${index}::jsonb`;
  }
  if (type === "number") {
    values.push(value);
    return `$${index}::numeric`;
  }
  if (type === "boolean") {
    values.push(value === true || value === "true");
    return `$${index}::boolean`;
  }
  if (type === "uuid") {
    values.push(String(value));
    return `$${index}::uuid`;
  }
  if (type === "date") {
    values.push(value);
    return `$${index}::date`;
  }
  if (type === "time") {
    values.push(value);
    return `$${index}::timestamptz`;
  }
  values.push(value);
  return `$${index}`;
}

function bindArray(values: unknown[], list: unknown[], type: ColumnType): string {
  const index = values.length + 1;
  if (typeof type === "object" && type.kind === "enum") {
    values.push(list.map((item) => (item === null ? null : String(item))));
    return `$${index}::${quoteIdent(type.name)}[]`;
  }
  const cast = type === "uuid" ? "uuid" : type === "number" ? "numeric" : type === "boolean" ? "boolean" : type === "date" ? "date" : type === "time" ? "timestamptz" : "text";
  values.push(list.map((item) => (item === null ? null : String(item))));
  return `$${index}::${cast}[]`;
}

function orderSql(order: QueryRequest["order"]): string {
  if (!order?.length) return "";
  const parts = order.map((item) => {
    const direction = item.ascending === false ? "DESC" : "ASC";
    const nulls = item.nullsFirst ? "NULLS FIRST" : "NULLS LAST";
    return `${quoteIdent(item.column)} ${direction} ${nulls}`;
  });
  return ` ORDER BY ${parts.join(", ")}`;
}

function clampLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined) return 1000;
  if (!Number.isInteger(limit) || limit < 0) throw new Error("limit inválido");
  return Math.min(limit, 5000);
}

function clampOffset(offset: number | null | undefined): number {
  if (offset === null || offset === undefined) return 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error("offset inválido");
  return offset;
}

function asRows(values: QueryRequest["values"]): Record<string, unknown>[] {
  if (!values) return [];
  return Array.isArray(values) ? values : [values];
}

function parseFieldList(src: string): SelectField[] {
  const fields: SelectField[] = [];
  let index = 0;
  while (index < src.length) {
    while (index < src.length && /[\s,]/.test(src[index])) index += 1;
    if (index >= src.length) break;
    const start = index;
    let depth = 0;
    while (index < src.length) {
      const char = src[index];
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      else if (char === "," && depth === 0) break;
      index += 1;
    }
    const token = src.slice(start, index).trim();
    if (token) fields.push(parseField(token));
  }
  return fields;
}

function parseField(token: string): SelectField {
  const paren = token.indexOf("(");
  if (paren === -1) {
    if (token === "*") return { kind: "star" };
    quoteIdent(token);
    return { kind: "column", name: token };
  }
  if (!token.endsWith(")")) throw new Error(`Seleção inválida: ${token}`);
  const head = token.slice(0, paren).trim();
  const match = head.match(/^(?:([A-Za-z_][\w]*):)?([A-Za-z_][\w]*)(?:!([A-Za-z_][\w]*))?$/);
  if (!match) throw new Error(`Seleção inválida: ${head}`);
  return {
    kind: "embed",
    key: match[1] || match[2],
    target: match[2],
    hint: match[3] && match[3] !== "inner" ? match[3] : undefined,
    inner: match[3] === "inner",
    fields: parseFieldList(token.slice(paren + 1, -1)),
  };
}

const OR_OPS = ["not.ilike", "not.like", "not.in", "not.is", "not.eq", "ilike", "like", "neq", "gte", "lte", "gt", "lt", "eq", "is", "in"];

function parseLogicList(src: string): Logic[] {
  const items: Logic[] = [];
  let index = 0;
  while (index < src.length) {
    while (index < src.length && /[\s,]/.test(src[index])) index += 1;
    if (index >= src.length) break;
    if (src.startsWith("and(", index) || src.startsWith("or(", index)) {
      const kind = src.startsWith("and(", index) ? "and" : "or";
      const open = index + kind.length;
      const close = matchingParen(src, open);
      items.push({ kind, items: parseLogicList(src.slice(open + 1, close)) });
      index = close + 1;
      continue;
    }
    const start = index;
    let depth = 0;
    while (index < src.length) {
      const char = src[index];
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      else if (char === "," && depth === 0) break;
      index += 1;
    }
    const token = src.slice(start, index).trim();
    if (token) items.push(parseCmp(token));
  }
  return items;
}

function parseCmp(token: string): Logic {
  for (const op of OR_OPS) {
    const needle = `.${op}.`;
    const at = token.indexOf(needle);
    if (at > 0) {
      const column = token.slice(0, at);
      const raw = token.slice(at + needle.length);
      for (const part of column.split(".")) quoteIdent(part);
      return { kind: "cmp", column, op, value: coerceOrValue(op, raw) };
    }
  }
  throw new Error(`Filtro inválido: ${token}`);
}

function coerceOrValue(op: string, raw: string): unknown {
  if (op === "is" || op === "not.is" || raw === "null") return raw === "null" ? null : raw;
  if (op === "in" || op === "not.in") return parseInList(raw);
  return raw;
}

function parseInList(raw: string): string[] {
  const trimmed = raw.trim();
  const inner = trimmed.startsWith("(") && trimmed.endsWith(")") ? trimmed.slice(1, -1) : trimmed;
  if (!inner.trim()) return [];
  return inner.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

function matchingParen(src: string, open: number): number {
  let depth = 0;
  for (let index = open; index < src.length; index += 1) {
    if (src[index] === "(") depth += 1;
    else if (src[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Parêntese sem fecho");
}

import type { PrismaService } from "../prisma/prisma.service";

export type ResolvedEmailTemplate = {
  id: string;
  name?: string | null;
  event_type?: string;
  subject: string;
  body_html: string;
  body_text?: string | null;
  cc_emails?: string | null;
  bcc_emails?: string | null;
  logo_url?: string | null;
  [key: string]: unknown;
};

/**
 * Resolve template por estabelecimento.
 * Se desativado em establishment_email_templates (is_active=false), retorna null — sem fallback global.
 */
export async function resolveEstablishmentEmailTemplate(
  prisma: PrismaService,
  eventType: string,
  establishmentId: string | null | undefined,
): Promise<ResolvedEmailTemplate | null> {
  if (establishmentId) {
    try {
      const rows = await prisma.$queryRaw<Array<{ template: unknown }>>`
        SELECT public.get_resolved_email_template(
          ${eventType}::public.email_event_type,
          ${establishmentId}::uuid
        ) AS template
      `;
      // RPC executou com sucesso: null = sem template ou desativado no estabelecimento
      const raw = rows[0]?.template;
      if (raw == null) return null;
      const parsed = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
      if (parsed && typeof parsed === "object" && parsed.id) {
        return parsed as ResolvedEmailTemplate;
      }
      return null;
    } catch {
      // RPC indisponível: checar disable manualmente e cair no global
      const override = await prisma.establishment_email_templates.findFirst({
        where: { establishment_id: establishmentId, event_type: eventType as never },
        select: { is_active: true, use_custom_template: true, subject: true, body_html: true, body_text: true, name: true, cc_emails: true, bcc_emails: true, logo_url: true, id: true },
      });
      if (override && override.is_active === false) return null;

      const global = await prisma.email_templates.findFirst({
        where: { event_type: eventType as never, is_active: true },
        orderBy: { updated_at: "desc" },
      });
      if (!global) return null;
      if (!override?.use_custom_template) {
        return {
          id: global.id,
          name: global.name,
          event_type: String(global.event_type),
          subject: global.subject,
          body_html: global.body_html,
          body_text: global.body_text,
          cc_emails: global.cc_emails,
          bcc_emails: global.bcc_emails,
          logo_url: global.logo_url,
        };
      }
      return {
        id: global.id,
        name: override.name ?? global.name,
        event_type: String(global.event_type),
        subject: override.subject ?? global.subject,
        body_html: override.body_html ?? global.body_html,
        body_text: override.body_text ?? global.body_text,
        cc_emails: override.cc_emails ?? global.cc_emails,
        bcc_emails: override.bcc_emails ?? global.bcc_emails,
        logo_url: override.logo_url ?? global.logo_url,
        is_establishment_override: true,
        establishment_template_id: override.id,
      };
    }
  }

  const global = await prisma.email_templates.findFirst({
    where: { event_type: eventType as never, is_active: true },
    orderBy: { updated_at: "desc" },
  });
  if (!global) return null;
  return {
    id: global.id,
    name: global.name,
    event_type: String(global.event_type),
    subject: global.subject,
    body_html: global.body_html,
    body_text: global.body_text,
    cc_emails: global.cc_emails,
    bcc_emails: global.bcc_emails,
    logo_url: global.logo_url,
  };
}

/** Processa {{#if}}/{{else}}/{{/if}} com profundidade correta (suporta aninhamento). */
export function processEmailConditionals(
  template: string,
  variables: Record<string, unknown>,
): string {
  let processed = template || "";
  for (let pass = 0; pass < 50; pass += 1) {
    const next = processOneConditional(processed, variables);
    if (next === processed) break;
    processed = next;
  }
  // Remover tags órfãs que sobreviveram a templates malformados
  processed = processed
    .replace(/\{\{#if\s+[\w.]+\}\}/g, "")
    .replace(/\{\{else\}\}/g, "")
    .replace(/\{\{\/if\}\}/g, "");
  return processed;
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return value !== 0;
  if (typeof value === "boolean") return value;
  return true;
}

function getVar(variables: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return variables[path];
  const parts = path.split(".");
  let cur: unknown = variables;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function processOneConditional(template: string, variables: Record<string, unknown>): string {
  const startMatch = template.match(/\{\{#if\s+([\w.]+)\}\}/);
  if (!startMatch || startMatch.index == null) return template;
  const start = startMatch.index;
  const varName = startMatch[1];
  const openTag = startMatch[0];

  let depth = 1;
  let cursor = start + openTag.length;
  let elseAt = -1;

  while (depth > 0 && cursor < template.length) {
    const nextIf = template.indexOf("{{#if", cursor);
    const nextElse = template.indexOf("{{else}}", cursor);
    const nextEnd = template.indexOf("{{/if}}", cursor);
    if (nextEnd < 0) break;

    // Processar a próxima tag na ordem (if / else / endif) — evita fechar cedo no {{/if}} interno após {{else}}
    const candidates: Array<{ type: "if" | "else" | "endif"; pos: number }> = [
      { type: "endif", pos: nextEnd },
    ];
    if (nextIf >= 0) candidates.push({ type: "if", pos: nextIf });
    if (nextElse >= 0) candidates.push({ type: "else", pos: nextElse });
    candidates.sort((a, b) => a.pos - b.pos);
    const next = candidates[0];

    if (next.type === "if") {
      depth += 1;
      cursor = next.pos + 5;
      continue;
    }
    if (next.type === "else") {
      if (depth === 1 && elseAt < 0) elseAt = next.pos;
      cursor = next.pos + "{{else}}".length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      const end = nextEnd + "{{/if}}".length;
      const ifContent =
        elseAt > start
          ? template.slice(start + openTag.length, elseAt)
          : template.slice(start + openTag.length, nextEnd);
      const elseContent =
        elseAt > start ? template.slice(elseAt + "{{else}}".length, nextEnd) : "";
      const replacement = isTruthy(getVar(variables, varName)) ? ifContent : elseContent;
      return template.slice(0, start) + replacement + template.slice(end);
    }
    cursor = nextEnd + 7;
  }

  return template;
}

/**
 * Templates corrompidos às vezes guardam a sequência literal "\n" (duas chars)
 * em vez de quebra de linha — isso aparece no e-mail como texto "\n".
 */
export function sanitizeEmailTemplateLiterals(template: string): string {
  return String(template || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ");
}

/** URL de logo utilizável em e-mail (http/https absoluto). */
export function isUsableEmailLogoUrl(url: string | null | undefined): boolean {
  const value = String(url || "").trim();
  if (!value) return false;
  if (/^(null|undefined|none|#)$/i.test(value)) return false;
  return /^https?:\/\//i.test(value);
}

/**
 * Estabelecimento → sistema. Só retorna URL http(s) válida.
 * hotelLogo/siteLogo podem ser caminhos relativos; use resolve antes se necessário.
 */
export function pickEmailLogoUrl(
  hotelLogo: string | null | undefined,
  systemLogo: string | null | undefined,
): string {
  const hotel = String(hotelLogo || "").trim();
  const system = String(systemLogo || "").trim();
  if (isUsableEmailLogoUrl(hotel)) return hotel;
  if (isUsableEmailLogoUrl(system)) return system;
  // Caminhos relativos ainda não resolvidos: preferir hotel se não for placeholder
  if (hotel && !/^(null|undefined|none|#)$/i.test(hotel)) return hotel;
  if (system && !/^(null|undefined|none|#)$/i.test(system)) return system;
  return "";
}

/**
 * Uma única URL de logo: preenche logo_url e deixa hotel_logo vazio.
 * Evita duplicata quando o HTML tem dois {{#if}} sequenciais (sem {{else}}).
 */
export function emailLogoVariables(logoUrl: string | null | undefined): {
  logo_url: string;
  hotel_logo: string;
} {
  const url = String(logoUrl || "").trim();
  const usable = isUsableEmailLogoUrl(url) || (url && !/^(null|undefined|none|#)$/i.test(url));
  return { logo_url: usable ? url : "", hotel_logo: "" };
}

/** Remove <img> com src vazio/inválido e logos duplicadas no header. */
export function dedupeAdjacentSameSrcImages(html: string): string {
  let result = html || "";

  // src vazio / placeholder → remove a tag (ícone de imagem quebrada)
  result = result.replace(
    /<img\b(?=[^>]*\bsrc\s*=\s*["']\s*(?:null|undefined|none|#)?\s*["'])[^>]*>/gi,
    "",
  );

  for (let i = 0; i < 10; i += 1) {
    const next = result.replace(
      /(<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>)(\s*)(<img\b[^>]*\bsrc\s*=\s*["']\2["'][^>]*>)/gi,
      "$1",
    );
    if (next === result) break;
    result = next;
  }

  // Header escuro (#1f2937): manter só a primeira <img> (evita logo sistema + logo quebrada)
  result = result.replace(
    /(background-color\s*:\s*#1f2937[^>]*>)([\s\S]*?)(<h1\b)/gi,
    (_full, open: string, mid: string, h1: string) => {
      let kept = false;
      const cleaned = mid.replace(/<img\b[^>]*>/gi, (img) => {
        if (kept) return "";
        kept = true;
        return img;
      });
      return `${open}${cleaned}${h1}`;
    },
  );

  return result;
}

/** Condicionais + substituição de {{var}}. */
export function renderEmailTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  // Se ambas as vars de logo estão iguais, zera hotel_logo (fallback só via {{else}})
  const vars = { ...variables };
  const logo = String(vars.logo_url ?? "").trim();
  const hotelLogo = String(vars.hotel_logo ?? "").trim();
  if (logo && hotelLogo && logo === hotelLogo) {
    vars.hotel_logo = "";
  } else if (!logo && hotelLogo) {
    vars.logo_url = hotelLogo;
    vars.hotel_logo = "";
  }

  let result = sanitizeEmailTemplateLiterals(template);
  result = processEmailConditionals(result, vars);
  result = result.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, path: string) => {
    const value = getVar(vars, path);
    return value == null ? "" : String(value);
  });
  result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const value = getVar(vars, path);
    return value == null ? "" : String(value);
  });
  // Segurança final contra tags Handlebars órfãs
  result = result
    .replace(/\{\{\/if\}\}/g, "")
    .replace(/\{\{else\}\}/g, "")
    .replace(/\{\{#if\s+[\w.]+\}\}/g, "");
  // Em HTML, quebras literais entre blocos não devem aparecer como texto
  result = result.replace(/(?<=>)\s*\n+\s*(?=<)/g, "");
  return dedupeAdjacentSameSrcImages(result);
}

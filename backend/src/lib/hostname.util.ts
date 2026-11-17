import { randomBytes } from "crypto";
import type { Request } from "express";

export function normalizeHostname(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutPort = trimmed.split(":")[0];
  return withoutPort.replace(/^www\./, "");
}

export function hostnameFromUrlOrHost(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return normalizeHostname(new URL(withScheme).hostname);
  } catch {
    return normalizeHostname(trimmed.split("/")[0] ?? "");
  }
}

/** Hostname da requisição — prioriza X-Forwarded-Host (proxy Traefik/nginx). */
export function resolveRequestHostname(req: Request): string {
  const trustProxy = process.env.TRUST_PROXY_HEADERS !== "false";
  const forwarded = req.header("x-forwarded-host");
  const raw =
    trustProxy && forwarded
      ? forwarded.split(",")[0]?.trim() || ""
      : req.header("host") || "";
  return normalizeHostname(raw);
}

export function verificationTxtRecordName(hostname: string): string {
  return `_pms-verification.${hostname}`;
}

export function verificationTxtValue(token: string): string {
  return `pms-domain-verification=${token}`;
}

export function generateDomainVerificationToken(): string {
  return randomBytes(24).toString("base64url");
}
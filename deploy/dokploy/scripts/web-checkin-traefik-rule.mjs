#!/usr/bin/env node
/**
 * Gera WEB_CHECKIN_TRAEFIK_RULE para labels Traefik (vários domínios com ||).
 * Uso: node deploy/dokploy/scripts/web-checkin-traefik-rule.mjs checkin.stayos.com.br outro.dominio.com
 */
function hostnameFromInput(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  try {
    const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    const bare = t.split("/")[0].toLowerCase();
    return bare || null;
  }
}

const inputs = process.argv.slice(2);
const hosts = [...new Set(inputs.map(hostnameFromInput).filter(Boolean))];

if (hosts.length === 0) {
  console.error("Informe ao menos um domínio ou URL (ex. https://checkin.stayos.com.br)");
  process.exit(1);
}

const rule = hosts.map((h) => `Host(\`${h}\`)`).join(" || ");
console.log(`WEB_CHECKIN_TRAEFIK_RULE=${rule}`);
console.log(`WEB_CHECKIN_PUBLIC_HOST=${hosts[0]}`);
if (hosts.length > 1) {
  console.log(`WEB_CHECKIN_PUBLIC_HOSTS=${hosts.join(",")}`);
}
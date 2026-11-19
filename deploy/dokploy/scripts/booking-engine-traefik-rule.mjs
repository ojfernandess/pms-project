#!/usr/bin/env node
/**
 * Gera BOOKING_ENGINE_TRAEFIK_RULE para labels Traefik (vários domínios do motor com ||).
 * Uso: node deploy/dokploy/scripts/booking-engine-traefik-rule.mjs reservas.hotel.com outro.dominio.com
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
  console.error("Informe ao menos um domínio do motor (ex. reservas.seuhotel.com.br)");
  process.exit(1);
}

const rule = hosts.map((h) => `Host(\`${h}\`)`).join(" || ");
console.log(`BOOKING_ENGINE_TRAEFIK_RULE=${rule}`);
console.log(`BOOKING_ENGINE_PUBLIC_HOSTS=${hosts.join(",")}`);
if (hosts.length === 1) {
  console.log(`# Inclua também em CORS_ORIGINS (backend): https://${hosts[0]}`);
}
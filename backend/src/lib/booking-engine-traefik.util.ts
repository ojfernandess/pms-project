import { normalizeHostname } from "./hostname.util";

export function buildBookingEngineTraefikHostRule(hosts: string[]): string {
  const unique = [...new Set(hosts.map((h) => normalizeHostname(h)).filter(Boolean))];
  if (unique.length === 0) return "Host(`booking-engine-route-disabled.invalid`)";
  return unique.map((h) => `Host(\`${h}\`)`).join(" || ");
}

export function bookingEngineHostnamesToCorsOrigins(hosts: string[]): string[] {
  return [...new Set(hosts.map((h) => normalizeHostname(h)).filter(Boolean))].map((h) => `https://${h}`);
}
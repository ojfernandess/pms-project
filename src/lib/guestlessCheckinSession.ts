/** Limpa sessão antiga (24h em localStorage) de versões anteriores. */
const LEGACY_KEYS = [
  "guest_checkin_mode",
  "guest_checkin_verified_locator",
  "guest_checkin_verified_expires",
  "guest_checkin_verified_email",
  "guest_checkin_verified_cpf",
] as const;
if (typeof localStorage !== "undefined") {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

/** Acesso guestless só na aba atual — F5 exige CPF/e-mail de novo (não persiste 24h no localStorage). */
type GuestlessAccess = {
  locator: string;
  email?: string;
  cpf?: string;
  expiresAt: number;
};

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
let activeAccess: GuestlessAccess | null = null;

function normalizeLocator(locator: string): string {
  return locator.trim().toUpperCase();
}

export function setGuestlessCheckinSession(
  locator: string,
  contacts?: { email?: string; cpf?: string },
): void {
  const trimmed = normalizeLocator(locator);
  activeAccess = {
    locator: trimmed,
    expiresAt: Date.now() + SESSION_TTL_MS,
    email: contacts?.email?.trim().toLowerCase(),
    cpf: contacts?.cpf?.replace(/\D/g, ""),
  };
}

export function getGuestlessVerifiedContacts(): { email?: string; cpf?: string } {
  if (!isGuestlessCheckinMode()) return {};
  return { email: activeAccess?.email, cpf: activeAccess?.cpf };
}

export function clearGuestlessCheckinSession(): void {
  activeAccess = null;
}

export function isGuestlessCheckinMode(): boolean {
  if (!activeAccess) return false;
  if (activeAccess.expiresAt <= Date.now()) {
    activeAccess = null;
    return false;
  }
  return true;
}

/** Sessão válida para o localizador informado (ou qualquer, se omitido). */
export function hasGuestlessCheckinSession(locator?: string): boolean {
  if (!isGuestlessCheckinMode()) return false;
  if (!activeAccess?.locator) return false;
  if (locator && activeAccess.locator !== normalizeLocator(locator)) return false;
  return true;
}
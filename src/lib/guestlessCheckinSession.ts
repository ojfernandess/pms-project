const MODE_KEY = "guest_checkin_mode";
const LOCATOR_KEY = "guest_checkin_verified_locator";
const EXPIRES_KEY = "guest_checkin_verified_expires";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function setGuestlessCheckinSession(locator: string): void {
  const trimmed = locator.trim().toUpperCase();
  localStorage.setItem(MODE_KEY, "guestless");
  localStorage.setItem(LOCATOR_KEY, trimmed);
  localStorage.setItem(EXPIRES_KEY, new Date(Date.now() + SESSION_TTL_MS).toISOString());
}

export function clearGuestlessCheckinSession(): void {
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(LOCATOR_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function isGuestlessCheckinMode(): boolean {
  if (localStorage.getItem(MODE_KEY) !== "guestless") return false;
  const expires = localStorage.getItem(EXPIRES_KEY);
  if (!expires) return false;
  return new Date(expires).getTime() > Date.now();
}

/** Sessão válida para o localizador informado (ou qualquer, se omitido). */
export function hasGuestlessCheckinSession(locator?: string): boolean {
  if (!isGuestlessCheckinMode()) return false;
  const stored = localStorage.getItem(LOCATOR_KEY);
  if (!stored) return false;
  if (locator && stored !== locator.trim().toUpperCase()) return false;
  return true;
}
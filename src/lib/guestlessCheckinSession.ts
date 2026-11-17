const MODE_KEY = "guest_checkin_mode";
const LOCATOR_KEY = "guest_checkin_verified_locator";
const EXPIRES_KEY = "guest_checkin_verified_expires";
const EMAIL_KEY = "guest_checkin_verified_email";
const CPF_KEY = "guest_checkin_verified_cpf";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function setGuestlessCheckinSession(
  locator: string,
  contacts?: { email?: string; cpf?: string },
): void {
  const trimmed = locator.trim().toUpperCase();
  localStorage.setItem(MODE_KEY, "guestless");
  localStorage.setItem(LOCATOR_KEY, trimmed);
  localStorage.setItem(EXPIRES_KEY, new Date(Date.now() + SESSION_TTL_MS).toISOString());
  if (contacts?.email) {
    localStorage.setItem(EMAIL_KEY, contacts.email.trim().toLowerCase());
  } else {
    localStorage.removeItem(EMAIL_KEY);
  }
  if (contacts?.cpf) {
    localStorage.setItem(CPF_KEY, contacts.cpf.replace(/\D/g, ""));
  } else {
    localStorage.removeItem(CPF_KEY);
  }
}

export function getGuestlessVerifiedContacts(): { email?: string; cpf?: string } {
  if (!isGuestlessCheckinMode()) return {};
  const email = localStorage.getItem(EMAIL_KEY) || undefined;
  const cpf = localStorage.getItem(CPF_KEY) || undefined;
  return { email, cpf };
}

export function clearGuestlessCheckinSession(): void {
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(LOCATOR_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(CPF_KEY);
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
import { createHash, randomBytes } from "crypto";
import { compare, hash } from "bcrypt";

const BCRYPT_ROUNDS = 10;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function passwordsMatch(password: string, encryptedPassword: string): Promise<boolean> {
  if (!isBcryptHash(encryptedPassword)) return false;
  return compare(password, encryptedPassword);
}

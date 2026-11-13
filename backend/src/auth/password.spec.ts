import { hash } from "bcrypt";
import { isBcryptHash, passwordsMatch } from "./password";

describe("password hashes", () => {
  it("accepts a GoTrue-style bcrypt hash and rejects the wrong password", async () => {
    const encrypted = await hash("correct-password", 10);
    expect(isBcryptHash(encrypted)).toBe(true);
    await expect(passwordsMatch("correct-password", encrypted)).resolves.toBe(true);
    await expect(passwordsMatch("wrong-password", encrypted)).resolves.toBe(false);
  });

  it("does not treat a non-bcrypt value as a valid password", async () => {
    await expect(passwordsMatch("secret", "plain-secret")).resolves.toBe(false);
  });
});

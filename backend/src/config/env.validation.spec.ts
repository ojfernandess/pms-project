import { validateEnv } from "./env.validation";

describe("validateEnv", () => {
  it("requires database and redis urls", () => {
    expect(() => validateEnv({})).toThrow("DATABASE_URL is required");
  });

  it("parses a valid environment", () => {
    expect(
      validateEnv({
        DATABASE_URL: "postgresql://pms:pms@localhost:5432/pms",
        REDIS_URL: "redis://localhost:6379",
        PORT: "3001",
        SOCKET_AUTH_TOKEN: "socket",
        INTERNAL_API_TOKEN: "internal",
        JWT_SECRET: "local-development-jwt-secret-32chars",
      }),
    ).toEqual({
      DATABASE_URL: "postgresql://pms:pms@localhost:5432/pms",
      REDIS_URL: "redis://localhost:6379",
      PORT: 3001,
      SOCKET_AUTH_TOKEN: "socket",
      INTERNAL_API_TOKEN: "internal",
      JWT_SECRET: "local-development-jwt-secret-32chars",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL_DAYS: 7,
      PASSWORD_RESET_DEBUG: false,
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      PUBLIC_APP_URL: "",
    });
  });
});

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
      STORAGE_PROVIDER: "",
      STORAGE_DIR: "",
      MINIO_ENDPOINT: "",
      MINIO_PORT: "",
      MINIO_USE_SSL: "",
      MINIO_ACCESS_KEY: "",
      MINIO_SECRET_KEY: "",
      MINIO_BUCKET: "",
      MINIO_REGION: "",
    });
  });

  it("forwards storage env vars to config", () => {
    const env = validateEnv({
      DATABASE_URL: "postgresql://pms:pms@localhost:5432/pms",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "local-development-jwt-secret-32chars",
      STORAGE_PROVIDER: "minio",
      MINIO_ENDPOINT: "s3.stayos.com.br",
      MINIO_ACCESS_KEY: "key",
      MINIO_SECRET_KEY: "secret",
    });
    expect(env.STORAGE_PROVIDER).toBe("minio");
    expect(env.MINIO_ENDPOINT).toBe("s3.stayos.com.br");
    expect(env.MINIO_ACCESS_KEY).toBe("key");
  });
});

import {
  databaseUrlForLibpq,
  normalizePooledDatabaseUrl,
  sanitizeDatabaseUrlValue,
} from "./database-url";

describe("normalizePooledDatabaseUrl", () => {
  it("acrescenta pgbouncer=true na porta 6543", () => {
    const url = normalizePooledDatabaseUrl(
      "postgresql://u:p@aws.pooler.supabase.com:6543/postgres?connection_limit=4",
    );
    expect(url).toContain("pgbouncer=true");
    expect(url).toContain("connection_limit=4");
  });

  it("não altera URL local :5432", () => {
    const url = "postgresql://pms:pms@localhost:5432/pms";
    expect(normalizePooledDatabaseUrl(url)).toBe(url);
  });
});

describe("sanitizeDatabaseUrlValue", () => {
  it("remove prefixo DATABASE_URL= colado por engano", () => {
    expect(
      sanitizeDatabaseUrlValue(
        "DATABASE_URL=postgresql://u:p@projetolab_pms-postgres:5432/projetolab",
      ),
    ).toBe("postgresql://u:p@projetolab_pms-postgres:5432/projetolab");
  });
});

describe("databaseUrlForLibpq", () => {
  it("remove parâmetros só do Prisma para psql/node-pg", () => {
    const libpq = databaseUrlForLibpq(
      "postgresql://u:p@host:5432/db?schema=public&connection_limit=10&pool_timeout=30",
    );
    expect(libpq).toBe("postgresql://u:p@host:5432/db");
    expect(libpq).not.toContain("connection_limit");
  });
});

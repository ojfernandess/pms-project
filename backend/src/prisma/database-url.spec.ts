import { normalizePooledDatabaseUrl } from "./database-url";

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

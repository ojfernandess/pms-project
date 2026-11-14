import { compileQuery, parseOr, parseSelect, type Catalog } from "./query-compiler";

const catalog: Catalog = {
  types: {
    reservations: {
      id: "uuid",
      establishment_id: "uuid",
      status: { kind: "enum", name: "reservation_status" },
      checkin_date: "date",
      checkout_date: "date",
    },
    activity_logs: { id: "uuid", metadata: "json" },
    buildings: { id: "uuid", name: "text" },
    room_categories: { id: "uuid", building_id: "uuid", name: "text" },
  },
  fks: [
    {
      constraint: "room_categories_building_id_fkey",
      table: "room_categories",
      column: "building_id",
      foreignTable: "buildings",
      foreignColumn: "id",
      singular: true,
    },
  ],
};

describe("query compiler", () => {
  it("parses embeds with whitespace before parentheses (Supabase JS style)", () => {
    const parsed = parseSelect("*,\n          buildings (*)\n        ");
    expect(parsed[1]).toMatchObject({ kind: "embed", target: "buildings", key: "buildings" });
  });

  it("reads embedded resources and keeps filters as parameters", () => {
    const parsed = parseSelect("*, buildings(*)");
    expect(parsed).toEqual([
      { kind: "star" },
      { kind: "embed", key: "buildings", target: "buildings", hint: undefined, inner: false, fields: [{ kind: "star" }] },
    ]);
    const compiled = compileQuery({ action: "select", table: "room_categories", select: "id, buildings(name)", filters: [{ column: "id", op: "eq", value: "6d9b2c1a-1111-4111-8111-111111111111" }] }, catalog);
    expect(compiled.sql).toContain("jsonb_build_object");
    expect(compiled.sql).toContain('FROM "buildings"');
    expect(compiled.values).toEqual(["6d9b2c1a-1111-4111-8111-111111111111"]);
    expect(compiled.sql).toContain("$1::uuid");
  });

  it("parses and() groups used by the occupancy map", () => {
    expect(parseOr("and(checkin_date.lt.2026-01-02,checkout_date.gt.2026-01-01)")).toEqual({
      kind: "or",
      items: [{
        kind: "and",
        items: [
          { kind: "cmp", column: "checkin_date", op: "lt", value: "2026-01-02" },
          { kind: "cmp", column: "checkout_date", op: "gt", value: "2026-01-01" },
        ],
      }],
    });
  });

  it("matches nothing when in() is empty", () => {
    const compiled = compileQuery({ action: "select", table: "reservations", filters: [{ column: "id", op: "in", value: [] }] }, catalog);
    expect(compiled.sql).toContain("FALSE");
  });

  it("refuses an update without a filter", () => {
    expect(() => compileQuery({ action: "update", table: "reservations", values: { status: "cancelled" } }, catalog)).toThrow(/sem filtro/);
  });

  it("supports json text filters metadata->>key", () => {
    const compiled = compileQuery(
      {
        action: "select",
        table: "activity_logs",
        filters: [{ column: "metadata->>reservation_id", op: "eq", value: "abc" }],
      },
      catalog,
    );
    expect(compiled.sql).toContain(`t."metadata"->>'reservation_id' = $1`);
    expect(compiled.values).toEqual(["abc"]);
  });

  it("casts enum filters to the Postgres enum type", () => {
    const compiled = compileQuery(
      { action: "select", table: "reservations", filters: [{ column: "status", op: "eq", value: "confirmed" }] },
      catalog,
    );
    expect(compiled.sql).toContain('$1::"reservation_status"');
    expect(compiled.values).toEqual(["confirmed"]);
  });
});

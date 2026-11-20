import {
  evaluateCondition,
  evaluateConditions,
  parseActions,
  renderTemplate,
} from "./crm-automations.logic";

describe("crm-automations.logic", () => {
  const payload = {
    company_id: "co-1",
    source: "motor",
    status: "confirmed",
    email: "guest@example.com",
    guest_name: "Ana",
  };

  it("evaluates eq / neq / in / exists / contains", () => {
    expect(evaluateCondition({ field: "source", op: "eq", value: "motor" }, payload)).toBe(true);
    expect(evaluateCondition({ field: "source", op: "neq", value: "ota" }, payload)).toBe(true);
    expect(
      evaluateCondition({ field: "status", op: "in", value: ["confirmed", "checked_in"] }, payload),
    ).toBe(true);
    expect(evaluateCondition({ field: "email", op: "exists" }, payload)).toBe(true);
    expect(
      evaluateCondition({ field: "guest_name", op: "contains", value: "an" }, payload),
    ).toBe(true);
  });

  it("AND of conditions — empty list passes", () => {
    expect(evaluateConditions([], payload)).toBe(true);
    expect(
      evaluateConditions(
        [
          { field: "source", op: "eq", value: "motor" },
          { field: "email", op: "exists" },
        ],
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions([{ field: "source", op: "eq", value: "quote" }], payload),
    ).toBe(false);
  });

  it("parses actions and renders templates", () => {
    const actions = parseActions([
      { type: "create_activity", subject: "Olá {{guest_name}}", body: "{{email}}" },
      { type: "unknown" },
      null,
    ]);
    expect(actions).toHaveLength(2);
    expect(renderTemplate("Olá {{guest_name}}", payload)).toBe("Olá Ana");
    expect(renderTemplate("x {{missing}} y", payload)).toBe("x  y");
  });
});

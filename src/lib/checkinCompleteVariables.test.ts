import { describe, expect, it } from "vitest";
import { buildCheckinTemplateContext, substituteCheckinTemplateVars } from "./checkinCompleteVariables";

describe("substituteCheckinTemplateVars", () => {
  it("substitui variáveis em português e inglês", () => {
    const ctx = buildCheckinTemplateContext({
      guestName: "João",
      roomPassword: "1234",
      categoryName: "Apartamento",
      locator: "ABC123",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-20",
    });

    expect(substituteCheckinTemplateVars("Olá {{nome_hospede}}, senha {{senha_quarto}}", ctx)).toBe(
      "Olá João, senha 1234",
    );
    expect(substituteCheckinTemplateVars("{{guest_name}} — {{locator}}", ctx)).toBe("João — ABC123");
  });

  it("remove placeholder quando valor ausente", () => {
    const ctx = buildCheckinTemplateContext({});
    expect(substituteCheckinTemplateVars("Senha: {{room_password}}", ctx)).toBe("Senha: ");
  });
});
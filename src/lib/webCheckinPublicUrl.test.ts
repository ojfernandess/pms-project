import { describe, expect, it } from "vitest";
import {
  buildWebCheckinLocatorUrl,
  getWebCheckinRoutePrefix,
  resolveWebCheckinPublicBase,
} from "./webCheckinPublicUrl";

describe("webCheckinPublicUrl", () => {
  it("usa base customizada com path alternativo", () => {
    const settings = { web_checkin_public_base_url: "https://checkin.stayos.com.br/Localizador" };
    expect(resolveWebCheckinPublicBase(settings)).toBe("https://checkin.stayos.com.br/Localizador");
    expect(buildWebCheckinLocatorUrl("RSV123", settings)).toBe(
      "https://checkin.stayos.com.br/Localizador/RSV123",
    );
    expect(getWebCheckinRoutePrefix(settings)).toBe("Localizador");
  });

  it("fallback para pms_base_url/web-checkin", () => {
    const settings = { pms_base_url: "https://pms.stayos.com.br" };
    expect(buildWebCheckinLocatorUrl("ABC", settings)).toBe(
      "https://pms.stayos.com.br/web-checkin/ABC",
    );
  });
});
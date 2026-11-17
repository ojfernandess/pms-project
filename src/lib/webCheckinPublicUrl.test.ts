import { describe, expect, it } from "vitest";
import {
  buildWebCheckinLocatorUrl,
  getWebCheckinRoutePrefix,
  resolveWebCheckinPublicBase,
} from "./webCheckinPublicUrl";

describe("webCheckinPublicUrl", () => {
  it("usa domínio dedicado sem subcaminho", () => {
    const settings = { web_checkin_public_base_url: "https://checkin.stayos.com.br" };
    expect(resolveWebCheckinPublicBase(settings)).toBe("https://checkin.stayos.com.br");
    expect(buildWebCheckinLocatorUrl("RSV154684", settings)).toBe(
      "https://checkin.stayos.com.br/RSV154684",
    );
    expect(getWebCheckinRoutePrefix(settings)).toBe("");
  });

  it("suporta subcaminho opcional no mesmo host", () => {
    const settings = { web_checkin_public_base_url: "https://pms.stayos.com.br/entrada-checkin" };
    expect(buildWebCheckinLocatorUrl("RSV123", settings)).toBe(
      "https://pms.stayos.com.br/entrada-checkin/RSV123",
    );
    expect(getWebCheckinRoutePrefix(settings)).toBe("entrada-checkin");
  });

  it("fallback para pms_base_url/web-checkin", () => {
    const settings = { pms_base_url: "https://pms.stayos.com.br" };
    expect(buildWebCheckinLocatorUrl("ABC", settings)).toBe(
      "https://pms.stayos.com.br/web-checkin/ABC",
    );
  });
});
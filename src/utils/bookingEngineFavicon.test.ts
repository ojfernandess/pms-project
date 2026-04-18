import { describe, it, expect, beforeEach } from "vitest";
import {
  applyMotorBookingEngineFavicon,
  countFaviconLinkElements,
  isValidClientMotorFaviconUrl,
  removeAllFaviconLinks,
  __resetMotorFaviconStateForTests,
} from "./bookingEngineFavicon";

describe("applyMotorBookingEngineFavicon", () => {
  beforeEach(() => {
    __resetMotorFaviconStateForTests();
    removeAllFaviconLinks(document);
  });

  it("com empresa configurada, deixa exatamente um link rel=icon com o href do cliente (cache bust)", () => {
    const r = applyMotorBookingEngineFavicon({
      id: "c-1",
      booking_engine_favicon: "https://cdn.example.com/favicon.ico",
    });
    expect(r.status).toBe("applied");
    if (r.status !== "applied") return;
    expect(r.linkCount).toBe(1);
    expect(r.href).toContain("https://cdn.example.com/favicon.ico");
    expect(r.href).toContain("v=c-1");

    const links = document.querySelectorAll('link[rel="icon"]');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("data-motor-booking-favicon")).toBe("1");
    expect(links[0].getAttribute("href")).toBe(r.href);
  });

  it("segunda chamada com mesmo href é noop e mantém um único link", () => {
    const company = {
      id: "c-1",
      booking_engine_favicon: "https://cdn.example.com/f.ico",
    };
    const first = applyMotorBookingEngineFavicon(company);
    const second = applyMotorBookingEngineFavicon(company);
    expect(first.status).toBe("applied");
    expect(second.status).toBe("noop");
    expect(countFaviconLinkElements(document)).toBe(1);
  });

  it("sem favicon configurado remove ícones e não injeta placeholder do sistema", () => {
    const fake = document.createElement("link");
    fake.rel = "icon";
    fake.href = "data:image/svg+xml,%3Csvg%3E%3C/svg%3E";
    document.head.appendChild(fake);

    const r = applyMotorBookingEngineFavicon({
      id: "x",
      booking_engine_favicon: null,
    });
    expect(r.status).toBe("cleared");
    if (r.status !== "cleared") return;
    expect(r.reason).toBe("no_client_config");
    expect(countFaviconLinkElements(document)).toBe(0);
  });

  it("URL inválida limpa o DOM sem fallback", () => {
    const r = applyMotorBookingEngineFavicon({
      id: "x",
      booking_engine_favicon: "javascript:alert(1)",
    });
    expect(r.status).toBe("cleared");
    if (r.status !== "cleared") return;
    expect(r.reason).toBe("invalid_url");
    expect(countFaviconLinkElements(document)).toBe(0);
  });

  it("aceita caminho relativo e data URI de imagem", () => {
    expect(isValidClientMotorFaviconUrl("/storage/f.ico")).toBe(true);
    expect(isValidClientMotorFaviconUrl("data:image/png;base64,AAA")).toBe(true);
    const r = applyMotorBookingEngineFavicon({
      id: "c2",
      booking_engine_favicon: "/storage/f.ico",
    });
    expect(r.status).toBe("applied");
    if (r.status !== "applied") return;
    expect(r.href).toContain("/storage/f.ico");
    expect(countFaviconLinkElements(document)).toBe(1);
  });
});

describe("isValidClientMotorFaviconUrl", () => {
  it("rejeita esquemas não permitidos", () => {
    expect(isValidClientMotorFaviconUrl("data:text/html,base")).toBe(false);
    expect(isValidClientMotorFaviconUrl("ftp://x.com/f.ico")).toBe(false);
  });
});

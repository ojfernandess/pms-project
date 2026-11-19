import { probeHttpsCertificate } from "./https-probe";

describe("https-probe", () => {
  it("retorna objeto com sslOk boolean", async () => {
    const result = await probeHttpsCertificate("invalid-hostname.example");
    expect(typeof result.sslOk).toBe("boolean");
    expect(typeof result.isTraefikDefault).toBe("boolean");
  });
});
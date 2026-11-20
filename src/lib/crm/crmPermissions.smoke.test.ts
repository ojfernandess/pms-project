import { getFeatureFromPath, checkPermission } from "@/lib/permissions";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";

describe("CRM permissions + flag smoke", () => {
  it("maps all CRM routes to feature crm", () => {
    expect(getFeatureFromPath("/12/crm")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/contatos")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/contatos/abc")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/pipeline")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/segmentos")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/campanhas")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/automacoes")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/empresas")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/fidelidade")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/relatorios")).toBe("crm");
  });

  it("allows manager crm permission object", () => {
    const role = {
      id: "1",
      code: "manager",
      name: "Gerente",
      permissions: {
        crm: true,
        crm_contacts: { create: true, read: true, update: true },
      },
    } as any;
    expect(checkPermission(role, "crm")).toBe(true);
    expect(checkPermission(role, "crm_contacts", "read")).toBe(true);
    expect(checkPermission(role, "crm_contacts", "create")).toBe(true);
  });

  it("feature flag crm uses company_ids", () => {
    const config = { enabled: true, company_ids: ["co-1"] };
    expect(isFeatureEnabledForEstablishment(config, "co-1", true)).toBe(true);
    expect(isFeatureEnabledForEstablishment(config, "co-2", true)).toBe(false);
    expect(isFeatureEnabledForEstablishment({ enabled: false, company_ids: ["co-1"] }, "co-1", true)).toBe(
      false,
    );
  });
});

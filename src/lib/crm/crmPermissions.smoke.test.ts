import { getFeatureFromPath, checkPermission } from "@/lib/permissions";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";

describe("CRM permissions + flag smoke", () => {
  it("maps CRM routes to features", () => {
    expect(getFeatureFromPath("/12/crm")).toBe("crm");
    expect(getFeatureFromPath("/12/crm/contatos")).toBe("crm_contacts");
    expect(getFeatureFromPath("/12/crm/contatos/abc")).toBe("crm_contacts");
    expect(getFeatureFromPath("/12/crm/pipeline")).toBe("crm_deals");
    expect(getFeatureFromPath("/12/crm/segmentos")).toBe("crm_campaigns");
    expect(getFeatureFromPath("/12/crm/campanhas")).toBe("crm_campaigns");
    expect(getFeatureFromPath("/12/crm/automacoes")).toBe("crm_automations");
    expect(getFeatureFromPath("/12/crm/empresas")).toBe("crm_b2b");
    expect(getFeatureFromPath("/12/crm/fidelidade")).toBe("crm_loyalty");
    expect(getFeatureFromPath("/12/crm/relatorios")).toBe("crm_reports");
  });

  it("allows manager crm_contacts permission object", () => {
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

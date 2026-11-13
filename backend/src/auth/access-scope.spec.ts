import { canAccessCompany, canAccessEstablishment } from "./access-scope";

const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("canAccessEstablishment", () => {
  it("allows a super admin into any establishment", () => {
    expect(
      canAccessEstablishment({
        isSuperAdmin: true,
        companyIds: [],
        establishmentCompanyId: companyB,
      }),
    ).toBe(true);
  });

  it("allows a company member into that company's establishment", () => {
    expect(
      canAccessEstablishment({
        isSuperAdmin: false,
        companyIds: [companyA],
        establishmentCompanyId: companyA,
      }),
    ).toBe(true);
  });

  it("denies a company member from another company's establishment", () => {
    expect(
      canAccessEstablishment({
        isSuperAdmin: false,
        companyIds: [companyA],
        establishmentCompanyId: companyB,
      }),
    ).toBe(false);
  });

  it("denies an employee who is not linked in user_companies", () => {
    expect(
      canAccessEstablishment({
        isSuperAdmin: false,
        companyIds: [],
        establishmentCompanyId: companyA,
      }),
    ).toBe(false);
  });

  it("denies access when the establishment does not exist", () => {
    expect(
      canAccessEstablishment({
        isSuperAdmin: false,
        companyIds: [companyA],
        establishmentCompanyId: null,
      }),
    ).toBe(false);
  });
});

describe("canAccessCompany", () => {
  it("isolates companies", () => {
    expect(canAccessCompany(false, [companyA], companyB)).toBe(false);
    expect(canAccessCompany(false, [companyA], companyA)).toBe(true);
    expect(canAccessCompany(true, [], companyB)).toBe(true);
  });
});

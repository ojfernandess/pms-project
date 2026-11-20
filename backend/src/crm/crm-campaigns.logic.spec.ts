import {
  contactMatchesSegment,
  hasMarketingConsent,
  planCampaignRecipients,
} from "./crm-campaigns.logic";

describe("crm-campaigns.logic", () => {
  const contact = {
    id: "c1",
    email: "a@b.com",
    phone: "11999999999",
    source: "quote_staff",
    tags: ["vip"],
  };

  it("matches segment rules", () => {
    expect(contactMatchesSegment(contact, { has_email: true, source_in: ["quote_staff"] })).toBe(
      true,
    );
    expect(contactMatchesSegment(contact, { source_in: ["motor_abandon"] })).toBe(false);
    expect(contactMatchesSegment(contact, { tag_any: ["vip"] })).toBe(true);
  });

  it("requires marketing consent for campaign send", () => {
    expect(hasMarketingConsent([], "c1", "email")).toBe(false);
    expect(
      hasMarketingConsent(
        [{ crm_contact_id: "c1", channel: "email", purpose: "marketing", granted: true }],
        "c1",
        "email",
      ),
    ).toBe(true);
  });

  it("plans recipients skipping without consent", () => {
    const plan = planCampaignRecipients({
      contacts: [contact],
      rules: { has_email: true },
      consents: [],
      channel: "email",
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].status).toBe("skipped_no_consent");

    const withConsent = planCampaignRecipients({
      contacts: [contact],
      rules: { has_email: true },
      consents: [
        { crm_contact_id: "c1", channel: "email", purpose: "marketing", granted: true },
      ],
      channel: "email",
    });
    expect(withConsent[0].status).toBe("pending");
    if (withConsent[0].status === "pending") {
      expect(withConsent[0].address).toBe("a@b.com");
    }
  });
});

export type SegmentRules = {
  source_in?: string[];
  has_email?: boolean;
  has_phone?: boolean;
  classification_eq?: string | null;
  tag_any?: string[];
};

export type ContactForSegment = {
  id: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  source?: string | null;
  classification?: string | null;
  tags?: unknown;
};

export type ConsentRow = {
  crm_contact_id: string;
  channel: string;
  purpose: string;
  granted: boolean;
};

export function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function contactMatchesSegment(contact: ContactForSegment, rules: SegmentRules): boolean {
  if (rules.source_in?.length) {
    if (!contact.source || !rules.source_in.includes(contact.source)) return false;
  }
  if (rules.has_email === true && !String(contact.email || "").trim()) return false;
  if (rules.has_phone === true) {
    const phone = String(contact.phone || contact.whatsapp || "").trim();
    if (!phone) return false;
  }
  if (rules.classification_eq) {
    if (String(contact.classification || "") !== rules.classification_eq) return false;
  }
  if (rules.tag_any?.length) {
    const tags = parseTags(contact.tags);
    if (!rules.tag_any.some((t) => tags.includes(t))) return false;
  }
  return true;
}

/** Campanhas de marketing exigem opt-in explícito (crm_consent.granted). */
export function hasMarketingConsent(
  consents: ConsentRow[],
  contactId: string,
  channel: string,
): boolean {
  const normalized = channel.toLowerCase();
  return consents.some(
    (c) =>
      c.crm_contact_id === contactId &&
      c.purpose === "marketing" &&
      c.channel.toLowerCase() === normalized &&
      c.granted === true,
  );
}

export function resolveRecipientAddress(contact: ContactForSegment, channel: string): string | null {
  const ch = channel.toLowerCase();
  if (ch === "email") return String(contact.email || "").trim() || null;
  if (ch === "whatsapp" || ch === "sms") {
    return String(contact.whatsapp || contact.phone || "").trim() || null;
  }
  return null;
}

export type RecipientPlan =
  | { contactId: string; status: "pending"; address: string; channel: string }
  | { contactId: string; status: "skipped_no_consent" | "skipped_no_address"; address: null; channel: string; skip_reason: string };

export function planCampaignRecipients(input: {
  contacts: ContactForSegment[];
  rules: SegmentRules;
  consents: ConsentRow[];
  channel: string;
}): RecipientPlan[] {
  const matched = input.contacts.filter((c) => contactMatchesSegment(c, input.rules));
  return matched.map((contact) => {
    if (!hasMarketingConsent(input.consents, contact.id, input.channel)) {
      return {
        contactId: contact.id,
        status: "skipped_no_consent" as const,
        address: null,
        channel: input.channel,
        skip_reason: "missing_marketing_consent",
      };
    }
    const address = resolveRecipientAddress(contact, input.channel);
    if (!address) {
      return {
        contactId: contact.id,
        status: "skipped_no_address" as const,
        address: null,
        channel: input.channel,
        skip_reason: "missing_address",
      };
    }
    return {
      contactId: contact.id,
      status: "pending" as const,
      address,
      channel: input.channel,
    };
  });
}

export type AutomationCondition = {
  field: string;
  op: "eq" | "neq" | "in" | "exists" | "contains";
  value?: unknown;
};

export type AutomationAction =
  | {
      type: "create_activity";
      activity_type?: string;
      subject?: string;
      body?: string;
    }
  | {
      type: "enqueue_outbox";
      event_type: string;
    }
  | {
      type: "set_contact_classification";
      classification: string;
    }
  | {
      type: "add_contact_tag";
      tag: string;
    };

export type TriggerPayload = Record<string, unknown> & {
  company_id?: string;
  client_id?: string;
  crm_contact_id?: string;
  reservation_id?: string;
  source?: string;
  status?: string;
  email?: string;
  phone?: string;
  full_name?: string;
  guest_name?: string;
};

export function getPayloadField(payload: TriggerPayload, field: string): unknown {
  if (field.includes(".")) {
    const parts = field.split(".");
    let cur: unknown = payload;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }
  return payload[field];
}

export function evaluateCondition(condition: AutomationCondition, payload: TriggerPayload): boolean {
  const actual = getPayloadField(payload, condition.field);
  switch (condition.op) {
    case "exists":
      return actual != null && String(actual).trim() !== "";
    case "eq":
      return String(actual ?? "") === String(condition.value ?? "");
    case "neq":
      return String(actual ?? "") !== String(condition.value ?? "");
    case "in": {
      const list = Array.isArray(condition.value) ? condition.value.map(String) : [];
      return list.includes(String(actual ?? ""));
    }
    case "contains":
      return String(actual ?? "")
        .toLowerCase()
        .includes(String(condition.value ?? "").toLowerCase());
    default:
      return false;
  }
}

export function evaluateConditions(
  conditions: AutomationCondition[] | unknown,
  payload: TriggerPayload,
): boolean {
  const list = Array.isArray(conditions) ? (conditions as AutomationCondition[]) : [];
  if (!list.length) return true;
  return list.every((c) => evaluateCondition(c, payload));
}

export function parseActions(actions: unknown): AutomationAction[] {
  if (!Array.isArray(actions)) return [];
  return actions.filter((a) => a && typeof a === "object" && "type" in (a as object)) as AutomationAction[];
}

export function parseConditions(conditions: unknown): AutomationCondition[] {
  if (!Array.isArray(conditions)) return [];
  return conditions as AutomationCondition[];
}

/** Interpola {{campo}} simples a partir do payload. */
export function renderTemplate(text: string | undefined, payload: TriggerPayload): string {
  if (!text) return "";
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const val = getPayloadField(payload, key);
    return val == null ? "" : String(val);
  });
}

export const SYSTEM_TEMPLATE_KEYS = [
  "welcome_after_booking",
  "note_on_motor_abandon",
  "tag_deal_won",
  "checkout_followup_note",
] as const;

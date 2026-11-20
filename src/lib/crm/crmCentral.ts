import { supabase } from "@/integrations/supabase/client";

export type CentralFocusReservation = {
  id: string;
  reservation_code?: string | null;
  client_id?: string | null;
  guest_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
};

/** Resolve contato CRM a partir de client_id/guest_id da reserva (sem inbox novo). */
export async function resolveCrmContactIdFromReservation(
  companyId: string,
  reservation: CentralFocusReservation,
): Promise<string | null> {
  const clientIds = [reservation.client_id, reservation.guest_id].filter(Boolean) as string[];
  if (clientIds.length) {
    const { data: links } = await (supabase as any)
      .from("crm_contact_client_links")
      .select("crm_contact_id")
      .in("client_id", clientIds)
      .limit(20);
    const contactIds = [...new Set((links || []).map((l: { crm_contact_id: string }) => l.crm_contact_id))];
    if (contactIds.length) {
      const { data: contacts } = await (supabase as any)
        .from("crm_contacts")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .in("id", contactIds)
        .limit(1);
      if (contacts?.[0]?.id) return contacts[0].id as string;
    }
  }

  const email = reservation.guest_email?.trim().toLowerCase();
  const phone = (reservation.guest_phone || "").replace(/\D/g, "");
  if (email || phone.length >= 8) {
    let q = (supabase as any)
      .from("crm_contacts")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .limit(1);
    if (email) q = q.ilike("email", email);
    else q = q.ilike("phone", `%${phone.slice(-8)}%`);
    const { data } = await q.maybeSingle();
    if (data?.id) return data.id as string;
  }

  return null;
}

export function buildCrmCentralPath(
  establishmentPathId: string | number,
  opts?: { contactId?: string; reservationId?: string },
) {
  const base = `/${establishmentPathId}/crm/central`;
  const qs = new URLSearchParams();
  if (opts?.contactId) qs.set("contactId", opts.contactId);
  if (opts?.reservationId) qs.set("reservationId", opts.reservationId);
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

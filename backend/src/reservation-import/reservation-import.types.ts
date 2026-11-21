export type ReservationImportPerson = {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  birth_date?: string | null;
  nationality?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  notes?: string | null;
};

export type ReservationImportMapping = {
  building_external_code?: string | null;
  category_external_code?: string | null;
  room_external_code?: string | null;
  pricing_plan_external_code?: string | null;
};

export type ReservationImportCheckinGuest = {
  name?: string;
  document_number?: string | null;
  document_type?: string | null;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  is_main_guest?: boolean;
  nationality?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
};

export type ReservationImportPayment = {
  amount?: number | string;
  payment_method?: string;
  payment_date?: string | null;
  notes?: string | null;
};

export type ReservationImportItem = {
  external_id?: string | null;
  reservation_code?: string | null;
  identification_number?: string | number | null;
  status?: string | null;
  payment_status?: string | null;
  channel?: string | null;
  checkin_date?: string | null;
  checkout_date?: string | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  adults?: number | null;
  children?: number | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  notes?: string | null;
  mapping?: ReservationImportMapping | null;
  financial_responsible?: ReservationImportPerson | null;
  guest?: ReservationImportPerson | null;
  checkin?: {
    completed?: boolean;
    locator?: string | null;
    guests?: ReservationImportCheckinGuest[];
  } | null;
  payments?: ReservationImportPayment[] | null;
};

export type ReservationImportPayload = {
  version?: string;
  exported_at?: string;
  establishment?: { id?: string; external_code?: string };
  reservations?: ReservationImportItem[];
};

export type ReservationImportError = {
  code: string;
  reservation_code?: string | null;
  guest_name?: string | null;
  mapping_field?: string | null;
  external_code?: string | null;
  message: string;
  index?: number;
};

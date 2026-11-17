export type HostnameRoutingMode =
  | "pms"
  | "web_checkin"
  | "booking_engine"
  | "unconfigured"
  | "suspended"
  | "pending";

export interface HostnameResolution {
  hostname: string;
  mode: HostnameRoutingMode;
  service_type?: "web_checkin" | "booking_engine";
  company_id?: string | null;
  company_name?: string | null;
  active: boolean;
  internal_path?: string;
  message?: string;
  diagnosis?: string[];
}
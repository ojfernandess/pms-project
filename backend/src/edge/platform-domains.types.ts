export type PlatformDomainServiceType = "web_checkin" | "booking_engine";

export type PlatformDomainStatus =
  | "pending_dns"
  | "pending_verification"
  | "active"
  | "suspended"
  | "error";

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
  service_type?: PlatformDomainServiceType;
  company_id?: string | null;
  company_name?: string | null;
  active: boolean;
  internal_path?: string;
  message?: string;
  diagnosis?: string[];
}
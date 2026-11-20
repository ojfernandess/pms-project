import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { invokePmsFunction } from "@/lib/pmsApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import {
  reservationGuestContactFields,
  reservationGuestDisplayName,
} from "@/lib/reservationChannelDisplay";
import {
  CreditCard,
  Loader2,
  Save,
  Plus,
  Pencil,
  Trash2,
  Star,
  HelpCircle,
  Send,
  CalendarCheck,
  Wallet,
  MessageSquare,
  FileText,
  Bell,
  MoreVertical,
  Search,
  LayoutList,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TEMPLATE_VARS = [
  "guest_name",
  "reservation_code",
  "localizador",
  "checkin_date",
  "checkout_date",
  "amount",
  "payment_link",
  "web_checkin_link",
  "establishment_name",
  "establishment_address",
] as const;

const TEMPLATE_VAR_INFO: Record<string, { label: string; description: string }> = {
  guest_name: { label: "Nome do hóspede", description: "Nome completo do cliente" },
  reservation_code: { label: "Código da reserva", description: "Localizador/código" },
  localizador: { label: "Localizador", description: "Mesmo que código da reserva" },
  checkin_date: { label: "Data check-in", description: "Data de entrada" },
  checkout_date: { label: "Data check-out", description: "Data de saída" },
  amount: { label: "Valor", description: "Valor da cobrança" },
  payment_link: { label: "Link de pagamento", description: "URL para pagar" },
  web_checkin_link: { label: "Link web check-in", description: "URL do check-in online" },
  establishment_name: { label: "Nome do estabelecimento", description: "Nome do hotel/estabelecimento" },
  establishment_address: { label: "Endereço do estabelecimento", description: "Endereço completo do estabelecimento" },
};

/** Template padrão: cobrança de check-in (reserva confirmada + link pagamento/check-in). */
const DEFAULT_TEMPLATE_CHECKIN = `Olá {{guest_name}} 👋

Sua reserva está confirmada!

📌 Localizador: {{reservation_code}}
Check-in: {{checkin_date}}
Check-out: {{checkout_date}}

Para garantir sua entrada, realize o pagamento e check-in online no link abaixo:

🔗 {{payment_link}}

Qualquer dúvida, responda esta mensagem.`;

/** Template alternativo: lembrete de pagamento pendente. */
const DEFAULT_TEMPLATE_PAGAMENTO = `Olá {{guest_name}} 👋

Lembrete: sua reserva ({{reservation_code}}) possui valor pendente de R$ {{amount}}.

Check-in: {{checkin_date}} | Check-out: {{checkout_date}}

Pague e faça seu check-in online pelo link:

🔗 {{payment_link}}

Responda esta mensagem se tiver dúvidas.`;

/** Template: lembrete de checkout. */
const DEFAULT_TEMPLATE_CHECKOUT = `Olá {{guest_name}} 👋

Lembrete: seu check-out está previsto para {{checkout_date}}.

Localizador: {{reservation_code}}

Qualquer dúvida, responda esta mensagem. Até breve!`;

/** Template: reserva modificada. */
const DEFAULT_TEMPLATE_MODIFICADA = `Olá {{guest_name}} 👋

Sua reserva {{reservation_code}} foi atualizada com sucesso.

Novo período: {{checkin_date}} até {{checkout_date}}
Valor atualizado: R$ {{amount}}

Confira os detalhes e finalize, se necessário:
🔗 {{web_checkin_link}}
`;

/** Template: reserva cancelada. */
const DEFAULT_TEMPLATE_CANCELADA = `Olá {{guest_name}} 👋

Informamos que a reserva {{reservation_code}} foi cancelada.

Se precisar de uma nova hospedagem, nossa equipe está à disposição.
`;

/** Template: overbooking. */
const DEFAULT_TEMPLATE_OVERBOOKING = `Olá {{guest_name}} 👋

Identificamos uma indisponibilidade operacional para a reserva {{reservation_code}}.

Nossa equipe já está tratando a situação para garantir a melhor solução para sua estadia.
Em breve entraremos em contato com a atualização.
`;

type SendTiming = "after_confirmation" | "days_before_checkin" | "after_ota" | "manual";
type AmountType = "total" | "percent" | "fixed";
type ChannelType = "whatsapp_cloud" | "chatwoot" | "evolution_api" | "webhook";
type TemplateSource = "internal" | "meta" | "chatwoot";
type MetaIntentKey =
  | "checkin_reminder"
  | "payment_pending"
  | "checkout_reminder"
  | "reservation_modified"
  | "reservation_cancelled"
  | "reservation_overbooking"
  | "fallback";

type TemplateType =
  | "checkin_reminder"
  | "payment_pending"
  | "checkout_reminder"
  | "reservation_modified"
  | "reservation_cancelled"
  | "reservation_overbooking"
  | "custom";

interface CheckinChargeConfigRow {
  id: string;
  establishment_id: string;
  enabled: boolean;
  send_timing: SendTiming;
  days_before_checkin: number | null;
  amount_type: AmountType;
  amount_value: number | null;
  due_date_days: number;
  channel: ChannelType;
  channel_config: Record<string, unknown>;
  template_id: string | null;
  template_id_reminder?: string | null;
  template_id_payment?: string | null;
  template_id_checkout?: string | null;
  template_id_modified?: string | null;
  template_id_cancelled?: string | null;
  template_id_overbooking?: string | null;
  payment_link_expires_days: number;
  template_source?: TemplateSource;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
  meta_template_body_variables?: string[] | null;
  chatwoot_canned_response_id?: number | null;
  chatwoot_canned_response_short_code?: string | null;
  created_at: string;
  updated_at: string;
}

interface CheckinChargeTemplateRow {
  id: string;
  establishment_id: string;
  name: string;
  body: string;
  variables: string[];
  is_default: boolean;
  template_type?: TemplateType | null;
  created_at: string;
  updated_at: string;
}

type MetaTemplateSelection = { name: string; language: string; variables: string };
type MetaTemplatesByIntent = Record<MetaIntentKey, MetaTemplateSelection>;

const DEFAULT_META_TEMPLATES_BY_INTENT: MetaTemplatesByIntent = {
  checkin_reminder: { name: "", language: "pt_BR", variables: "guest_name, reservation_code, checkin_date, web_checkin_link" },
  payment_pending: { name: "", language: "pt_BR", variables: "guest_name, reservation_code, amount, payment_link" },
  checkout_reminder: { name: "", language: "pt_BR", variables: "guest_name, reservation_code, checkout_date" },
  reservation_modified: { name: "", language: "pt_BR", variables: "guest_name, reservation_code, checkin_date, checkout_date, amount" },
  reservation_cancelled: { name: "", language: "pt_BR", variables: "guest_name, reservation_code" },
  reservation_overbooking: { name: "", language: "pt_BR", variables: "guest_name, reservation_code, checkin_date, checkout_date" },
  fallback: { name: "", language: "pt_BR", variables: "guest_name, reservation_code, checkin_date, amount, payment_link, web_checkin_link" },
};

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp_cloud: "WhatsApp Cloud API",
  chatwoot: "Chatwoot",
  evolution_api: "Evolution API",
  webhook: "Webhook (URL)",
};

function formatCurrency(value: number): string {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** IDs únicos para PostgREST `.in()` — evita `id=in.(null)` ou lista vazia quando `client_id` é null. */
function uniqueNonNullClientIds(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id != null && id !== ""))];
}

type OtaGuestRowLite = { ota_guest_name?: string | null; ota_guest_phone?: string | null };

/** Nome/telefone: cliente (guest_id / client_id) + coluna guest_name + OTA/Aiosell (ota_reservations). */
function guestFieldsFromReservationAndClients(
  r: {
    client_id: string | null;
    guest_id?: string | null;
    guest_name?: string | null;
    ota_reservations?: OtaGuestRowLite[] | null;
  },
  clientsMap: Map<string, { name: string; phone: string | null }>
): { guest_name: string | null; guest_phone: string | null } {
  const guestClient = r.guest_id ? clientsMap.get(r.guest_id) : undefined;
  const finClient = r.client_id ? clientsMap.get(r.client_id) : undefined;
  const guestLm = guestClient ? { full_name: guestClient.name, phone: guestClient.phone } : null;
  const finLm = finClient ? { full_name: finClient.name, phone: finClient.phone } : null;
  const display = reservationGuestDisplayName({
    guest: guestLm,
    financial_responsible: finLm,
    ota_reservations: r.ota_reservations ?? undefined,
    guest_name: r.guest_name ?? null,
  });
  const { phone } = reservationGuestContactFields({
    guest: guestLm,
    financial_responsible: finLm,
    ota_reservations: r.ota_reservations ?? undefined,
  });
  const guest_name = display === "Hóspede" ? null : display;
  return { guest_name, guest_phone: phone };
}

/** Converte string de data (YYYY-MM-DD) para Date em horário local, evitando deslocamento de 1 dia por UTC. */
function parseLocalDate(dateStr: string): Date {
  const part = String(dateStr).split("T")[0];
  const [y, m, d] = part.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return new Date(dateStr);
  return new Date(y, m - 1, d);
}

interface PendingReservationRow {
  id: string;
  reservation_code: string;
  checkin_date: string;
  checkout_date?: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  client_id: string;
  guest_id?: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  charge_id?: string | null;
  charge_status?: string | null;
  charge_sent_at?: string | null;
}

export type CheckinChargeFocusReservation = {
  id: string;
  reservation_code?: string | null;
  client_id?: string | null;
  guest_id?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
};

export type CheckinChargeSettingsProps = {
  /** Quando true, omite título/ajuda da página (uso na Central CRM). */
  embedded?: boolean;
  focusedReservationId?: string | null;
  onFocusReservation?: (row: CheckinChargeFocusReservation) => void;
};

type PaymentListView = "recent_and_future" | "today_only" | "all";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  checkedin: "Check-in realizado",
};

function getInitials(name: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase();
}

function whatsAppLink(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `https://wa.me/55${digits}`;
  if (digits.length === 11 && digits.startsWith("55")) return `https://wa.me/${digits}`;
  if (digits.length === 11) return `https://wa.me/55${digits}`;
  if (digits.length >= 12) return `https://wa.me/${digits}`;
  return `https://wa.me/55${digits}`;
}

function ReservationsChargeTable({
  list,
  selectedIds,
  onToggleOne,
  onToggleAll,
  onSendOne,
  sendingCharge,
  formatCurrency: fmt,
  format: fmtDate,
  ptBR,
  showStatus,
  showPhone,
  phoneOverrides,
  onPhoneOverride,
  useCheckoutDate,
  focusedReservationId,
  onFocusReservation,
}: {
  list: PendingReservationRow[];
  selectedIds: string[];
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  onSendOne: (id: string) => void;
  sendingCharge: boolean;
  formatCurrency: (n: number) => string;
  format: (d: Date, s: string, o?: { locale: Locale }) => string;
  ptBR: Locale;
  showStatus?: boolean;
  showPhone?: boolean;
  phoneOverrides?: Record<string, string>;
  onPhoneOverride?: (reservationId: string, phone: string) => void;
  useCheckoutDate?: boolean;
  focusedReservationId?: string | null;
  onFocusReservation?: (row: CheckinChargeFocusReservation) => void;
}) {
  const dateLabel = useCheckoutDate ? "Check-out" : "Check-in";
  const dateField = useCheckoutDate ? "checkout_date" : "checkin_date";
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 border-b">
          <TableHead className="w-10">
            <Checkbox checked={list.length > 0 && selectedIds.length >= list.length} onCheckedChange={onToggleAll} />
          </TableHead>
          <TableHead className="w-[80px]">Hóspede</TableHead>
          <TableHead>Código</TableHead>
          {showPhone && <TableHead className="min-w-[150px]">Telefone</TableHead>}
          {showStatus && <TableHead>Status</TableHead>}
          <TableHead>{dateLabel}</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Pago</TableHead>
          <TableHead className="text-right">Pendente</TableHead>
          <TableHead>Status pagamento</TableHead>
          <TableHead className="min-w-[120px]">Último envio</TableHead>
          <TableHead className="w-36 text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((r) => {
          const pending = Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0));
          const isPaid = r.charge_status === "paid" || pending <= 0;
          const dateVal = r[dateField as keyof PendingReservationRow] as string | undefined;
          const phoneVal = (phoneOverrides && phoneOverrides[r.id] !== undefined) ? phoneOverrides[r.id] : (r.guest_phone ?? "");
          const isFocused = focusedReservationId === r.id;
          return (
            <TableRow
              key={r.id}
              className={`hover:bg-primary/5 transition-colors border-b border-border/50 last:border-b-0 ${
                isFocused ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""
              } ${onFocusReservation ? "cursor-pointer" : ""}`}
              onClick={() =>
                onFocusReservation?.({
                  id: r.id,
                  reservation_code: r.reservation_code,
                  client_id: r.client_id,
                  guest_id: r.guest_id,
                  guest_name: r.guest_name,
                  guest_phone: r.guest_phone,
                })
              }
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => onToggleOne(r.id)} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 rounded-full border-2 border-background shadow-sm">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {getInitials(r.guest_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm truncate max-w-[100px]" title={r.guest_name ?? ""}>
                    {r.guest_name ?? "—"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">{r.reservation_code}</TableCell>
              {showPhone && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="tel"
                      placeholder="Telefone"
                      value={phoneVal}
                      onChange={(e) => onPhoneOverride?.(r.id, e.target.value)}
                      className="h-8 text-sm font-mono w-[130px]"
                    />
                    {phoneVal && (
                      <a
                        href={whatsAppLink(phoneVal)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                        aria-label="Abrir WhatsApp"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </a>
                    )}
                  </div>
                </TableCell>
              )}
              {showStatus && (
                <TableCell>
                  <span className={r.status === "checkedin" ? "text-green-600 font-medium text-sm" : "text-muted-foreground text-sm"}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </TableCell>
              )}
              <TableCell className="text-sm">{dateVal ? fmtDate(parseLocalDate(dateVal), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
              <TableCell className="text-right text-sm">R$ {fmt(r.total_amount ?? 0)}</TableCell>
              <TableCell className="text-right text-sm">R$ {fmt(r.paid_amount ?? 0)}</TableCell>
              <TableCell className="text-right text-sm">R$ {fmt(pending)}</TableCell>
              <TableCell>
                <Badge variant={isPaid ? "default" : "secondary"} className={isPaid ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-100 text-amber-800 hover:bg-amber-200"}>
                  {isPaid ? "Pago" : "Pendente"}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.charge_sent_at
                  ? fmtDate(new Date(r.charge_sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                  : "—"}
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  onClick={() => onSendOne(r.id)}
                  disabled={sendingCharge}
                  className="rounded-lg shadow-sm gap-1.5 bg-primary hover:bg-primary/90"
                >
                  {sendingCharge ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Enviar</>}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Retorna início e fim do dia no fuso local do usuário para filtrar checkin_date (timestamptz) por data. */
function getCheckinDateRange(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function CheckinChargeSettings({
  embedded = false,
  focusedReservationId = null,
  onFocusReservation,
}: CheckinChargeSettingsProps = {}) {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const { settings: siteSettings } = useSiteSettings();
  const queryClient = useQueryClient();
  const establishmentUuid = selectedEstablishment?.id ?? establishmentId;

  const isEnabled = isFeatureEnabledForEstablishment(
    siteSettings?.features_enabled?.checkin_charge_enabled,
    selectedEstablishment?.company_id,
    true
  );

  // --- Config state
  const [enabled, setEnabled] = useState(false);
  const [sendTiming, setSendTiming] = useState<SendTiming>("after_confirmation");
  const [daysBeforeCheckin, setDaysBeforeCheckin] = useState<number>(3);
  const [amountType, setAmountType] = useState<AmountType>("total");
  const [amountValue, setAmountValue] = useState<string>("");
  const [dueDateDays, setDueDateDays] = useState(3);
  const [channel, setChannel] = useState<ChannelType>("whatsapp_cloud");
  const [channelConfig, setChannelConfig] = useState<Record<string, unknown>>({});
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateSource, setTemplateSource] = useState<TemplateSource>("internal");
  const [metaTemplatesByIntent, setMetaTemplatesByIntent] = useState<MetaTemplatesByIntent>(DEFAULT_META_TEMPLATES_BY_INTENT);
  const [chatwootCannedResponseId, setChatwootCannedResponseId] = useState<number | null>(null);
  const [chatwootCannedResponseShortCode, setChatwootCannedResponseShortCode] = useState("");
  const [paymentLinkExpiresDays, setPaymentLinkExpiresDays] = useState(7);
  const [configSaving, setConfigSaving] = useState(false);
  const [templateIdReminder, setTemplateIdReminder] = useState<string | null>(null);
  const [templateIdPayment, setTemplateIdPayment] = useState<string | null>(null);
  const [templateIdCheckout, setTemplateIdCheckout] = useState<string | null>(null);
  const [templateIdModified, setTemplateIdModified] = useState<string | null>(null);
  const [templateIdCancelled, setTemplateIdCancelled] = useState<string | null>(null);
  const [templateIdOverbooking, setTemplateIdOverbooking] = useState<string | null>(null);

  // --- Templates
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CheckinChargeTemplateRow | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateType, setTemplateType] = useState<TemplateType>("custom");
  const [templateIsDefault, setTemplateIsDefault] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const templateBodyRef = useRef<HTMLTextAreaElement>(null);

  // Reservas: filtro por data (padrão = hoje) e opção de incluir já com check-in realizado
  const [checkinDateFilter, setCheckinDateFilter] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [onlyWithoutPayment, setOnlyWithoutPayment] = useState(false);
  const [selectedReservationIds, setSelectedReservationIds] = useState<string[]>([]);
  const [sendingCharge, setSendingCharge] = useState(false);
  const [phoneOverrides, setPhoneOverrides] = useState<Record<string, string>>({});
  const [selectedTemplateIdForMessage, setSelectedTemplateIdForMessage] = useState<string | null>(null);
  const [messageDateFilter, setMessageDateFilter] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [includeCheckedInMessage, setIncludeCheckedInMessage] = useState(false);
  const [onlyPendingPaymentMessage, setOnlyPendingPaymentMessage] = useState(false);
  const [checkoutDateFilter, setCheckoutDateFilter] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [paymentListView, setPaymentListView] = useState<PaymentListView>("recent_and_future");
  const [includeCheckedInPayment, setIncludeCheckedInPayment] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<"all" | "paid" | "pending">("all");
  const [filterMessageSent, setFilterMessageSent] = useState<"all" | "yes" | "no">("all");
  const [digestDate, setDigestDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [sendingDigest, setSendingDigest] = useState(false);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["checkin_charge_config", establishmentUuid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_charge_config")
        .select("*")
        .eq("establishment_id", establishmentUuid)
        .maybeSingle();
      if (error) throw error;
      return data as CheckinChargeConfigRow | null;
    },
    enabled: !!establishmentUuid && isEnabled,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["checkin_charge_templates", establishmentUuid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_charge_templates")
        .select("*")
        .eq("establishment_id", establishmentUuid)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CheckinChargeTemplateRow[];
    },
    enabled: !!establishmentUuid && isEnabled,
  });

  // Lembrete de check-in: apenas reservas SEM check-in (pending, confirmed) e sem web_checkin concluído
  const { data: pendingReservationsRaw = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["checkin_charge_pending_reservations", establishmentUuid, onlyWithoutPayment, checkinDateFilter],
    queryFn: async () => {
      const range = getCheckinDateRange(checkinDateFilter);
      const { data: reservations, error } = await supabase
        .from("reservations")
        .select(
          "id, reservation_code, checkin_date, checkout_date, total_amount, paid_amount, status, client_id, guest_id, guest_name, web_checkin(status), ota_reservations(ota_guest_name, ota_guest_phone)"
        )
        .eq("establishment_id", establishmentUuid)
        .gte("checkin_date", range.start)
        .lt("checkin_date", range.end)
        .in("status", ["pending", "confirmed"])
        .order("checkin_date", { ascending: true });
      if (error) throw error;
      if (!reservations?.length) return [];
      const withCheckin = (reservations as { id: string; web_checkin?: { status: string }[] | { status: string } }[]).filter(
        (r) => !(Array.isArray(r.web_checkin) ? r.web_checkin : r.web_checkin ? [r.web_checkin] : []).some((w) => w?.status === "completed")
      );
      const ids = (withCheckin as { id: string }[]).map((r) => r.id);
      const clientIds = uniqueNonNullClientIds(
        (withCheckin as { client_id: string | null; guest_id?: string | null }[]).flatMap((r) => [r.client_id, r.guest_id])
      );
      const [clientsRes, chargesRes] = await Promise.all([
        clientIds.length
          ? supabase.from("clients").select("id, full_name, phone").in("id", clientIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string; phone?: string | null }[], error: null }),
        supabase.from("checkin_charges").select("reservation_id, id, status, sent_at").in("reservation_id", ids),
      ]);
      const clientsMap = new Map((clientsRes.data ?? []).map((c: { id: string; full_name: string; phone?: string | null }) => [c.id, { name: c.full_name, phone: c.phone ?? null }]));
      const chargesMap = new Map(
        (chargesRes.data ?? []).map((c: { reservation_id: string; id: string; status: string; sent_at: string | null }) => [
          c.reservation_id,
          { id: c.id, status: c.status, sent_at: c.sent_at },
        ])
      );
      const list: PendingReservationRow[] = withCheckin.map((r) => {
        const row = r as typeof r & {
          ota_reservations?: OtaGuestRowLite[] | null;
          guest_id?: string | null;
          guest_name?: string | null;
          client_id: string | null;
        };
        const { web_checkin: _wc, ota_reservations, ...rest } = row;
        const charge = chargesMap.get(r.id);
        const { guest_name, guest_phone } = guestFieldsFromReservationAndClients(
          {
            client_id: row.client_id,
            guest_id: row.guest_id ?? null,
            guest_name: row.guest_name ?? null,
            ota_reservations: ota_reservations ?? null,
          },
          clientsMap
        );
        return {
          ...rest,
          guest_name,
          guest_phone,
          charge_id: charge?.id ?? null,
          charge_status: charge?.status ?? null,
          charge_sent_at: charge?.sent_at ?? null,
        } as PendingReservationRow;
      });
      return list;
    },
    enabled: !!establishmentUuid && isEnabled && !!checkinDateFilter,
  });

  const pendingReservations = useMemo(() => {
    let list = pendingReservationsRaw;
    if (onlyWithoutPayment) list = list.filter((r) => Number(r.paid_amount || 0) < Number(r.total_amount || 0));
    if (guestSearch.trim()) {
      const q = guestSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.guest_name ?? "").toLowerCase().includes(q) || (r.reservation_code ?? "").toLowerCase().includes(q)
      );
    }
    if (filterPaymentStatus !== "all") {
      list = list.filter((r) => {
        const paid = Number(r.paid_amount ?? 0) >= Number(r.total_amount ?? 0) || r.charge_status === "paid";
        return filterPaymentStatus === "paid" ? paid : !paid;
      });
    }
    if (filterMessageSent !== "all") {
      list = list.filter((r) => (filterMessageSent === "yes" ? r.charge_sent_at : !r.charge_sent_at));
    }
    return list;
  }, [pendingReservationsRaw, onlyWithoutPayment, guestSearch, filterPaymentStatus, filterMessageSent]);

  // Cobrar pagamentos pendentes: quando "Incluir reservas com check-in já realizado" está desmarcado = só sem check-in; marcado = só com check-in
  const { data: pendingPaymentsRaw = [], isLoading: pendingPaymentsLoading } = useQuery({
    queryKey: ["checkin_charge_pending_payments", establishmentUuid, paymentListView, includeCheckedInPayment],
    queryFn: async () => {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const withCheckIn = includeCheckedInPayment;
      let query = supabase
        .from("reservations")
        .select(
          "id, reservation_code, checkin_date, checkout_date, total_amount, paid_amount, status, client_id, guest_id, guest_name, web_checkin(status), ota_reservations(ota_guest_name, ota_guest_phone)"
        )
        .eq("establishment_id", establishmentUuid)
        .in("status", withCheckIn ? ["pending", "unpaid", "confirmed", "checkedin"] : ["pending", "unpaid", "confirmed"]);
      if (paymentListView === "recent_and_future") {
        const range = getCheckinDateRange(todayStr);
        query = query.gte("checkin_date", range.start).order("checkin_date", { ascending: true });
      } else if (paymentListView === "today_only") {
        const range = getCheckinDateRange(todayStr);
        query = query.gte("checkin_date", range.start).lt("checkin_date", range.end).order("checkin_date", { ascending: true });
      } else {
        query = query.order("checkin_date", { ascending: false });
      }
      const { data: reservations, error } = await query;
      if (error) throw error;
      if (!reservations?.length) return [];

      type RowWithWebCheckin = PendingReservationRow & { web_checkin?: { status: string }[] | { status: string } };
      const hasCheckinDone = (r: RowWithWebCheckin) =>
        r.status === "checkedin" ||
        (Array.isArray(r.web_checkin) ? r.web_checkin : r.web_checkin ? [r.web_checkin] : []).some((w) => w?.status === "completed");

      const byPayment = (reservations as RowWithWebCheckin[]).filter(
        (r) => Number(r.paid_amount ?? 0) < Number(r.total_amount ?? 0)
      );
      const list = withCheckIn
        ? byPayment.filter(hasCheckinDone)
        : byPayment.filter((r) => !hasCheckinDone(r));

      const ids = list.map((r) => r.id);
      const clientIds = uniqueNonNullClientIds(
        list.flatMap((r) => [(r as { client_id: string | null }).client_id, (r as { guest_id?: string | null }).guest_id])
      );
      const [clientsRes, chargesRes] = await Promise.all([
        clientIds.length
          ? supabase.from("clients").select("id, full_name, phone").in("id", clientIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string; phone?: string | null }[], error: null }),
        supabase.from("checkin_charges").select("reservation_id, id, status, sent_at").in("reservation_id", ids),
      ]);
      const clientsMap = new Map((clientsRes.data ?? []).map((c: { id: string; full_name: string; phone?: string | null }) => [c.id, { name: c.full_name, phone: c.phone ?? null }]));
      const chargesMap = new Map(
        (chargesRes.data ?? []).map((c: { reservation_id: string; id: string; status: string; sent_at: string | null }) => [
          c.reservation_id,
          { id: c.id, status: c.status, sent_at: c.sent_at },
        ])
      );
      return list.map((r) => {
        const row = r as RowWithWebCheckin & {
          ota_reservations?: OtaGuestRowLite[] | null;
          guest_id?: string | null;
          guest_name?: string | null;
        };
        const { web_checkin: _wc, ota_reservations, ...rest } = row;
        const charge = chargesMap.get(r.id);
        const { guest_name, guest_phone } = guestFieldsFromReservationAndClients(
          {
            client_id: row.client_id,
            guest_id: row.guest_id ?? null,
            guest_name: row.guest_name ?? null,
            ota_reservations: ota_reservations ?? null,
          },
          clientsMap
        );
        return {
          ...rest,
          guest_name,
          guest_phone,
          charge_id: charge?.id ?? null,
          charge_status: charge?.status ?? null,
          charge_sent_at: charge?.sent_at ?? null,
        } as PendingReservationRow;
      });
    },
    enabled: !!establishmentUuid && isEnabled,
  });

  const pendingPaymentsOnlyReservations = useMemo(() => {
    let list = pendingPaymentsRaw;
    if (guestSearch.trim()) {
      const q = guestSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.guest_name ?? "").toLowerCase().includes(q) || (r.reservation_code ?? "").toLowerCase().includes(q)
      );
    }
    if (filterPaymentStatus !== "all") {
      list = list.filter((r) => {
        const paid = Number(r.paid_amount ?? 0) >= Number(r.total_amount ?? 0) || r.charge_status === "paid";
        return filterPaymentStatus === "paid" ? paid : !paid;
      });
    }
    if (filterMessageSent !== "all") {
      list = list.filter((r) => (filterMessageSent === "yes" ? r.charge_sent_at : !r.charge_sent_at));
    }
    return list;
  }, [pendingPaymentsRaw, guestSearch, filterPaymentStatus, filterMessageSent]);

  // Mensagem personalizada: desmarcado = só sem check-in; marcado = só com check-in (status checkedin ou web_checkin concluído)
  const { data: messageReservationsRaw = [], isLoading: messageLoading } = useQuery({
    queryKey: ["checkin_charge_message_reservations", establishmentUuid, messageDateFilter, includeCheckedInMessage, onlyPendingPaymentMessage],
    queryFn: async () => {
      const range = getCheckinDateRange(messageDateFilter);
      const withCheckIn = includeCheckedInMessage;
      const { data: reservations, error } = await supabase
        .from("reservations")
        .select(
          "id, reservation_code, checkin_date, checkout_date, total_amount, paid_amount, status, client_id, guest_id, guest_name, web_checkin(status), ota_reservations(ota_guest_name, ota_guest_phone)"
        )
        .eq("establishment_id", establishmentUuid)
        .gte("checkin_date", range.start)
        .lt("checkin_date", range.end)
        .in("status", withCheckIn ? ["pending", "unpaid", "confirmed", "checkedin"] : ["pending", "unpaid", "confirmed"])
        .order("checkin_date", { ascending: true });
      if (error) throw error;
      if (!reservations?.length) return [];

      type RowWithWebCheckinMsg = PendingReservationRow & { web_checkin?: { status: string }[] | { status: string } };
      const hasCheckinDone = (r: RowWithWebCheckinMsg) =>
        r.status === "checkedin" ||
        (Array.isArray(r.web_checkin) ? r.web_checkin : r.web_checkin ? [r.web_checkin] : []).some((w) => w?.status === "completed");

      let list = (reservations as RowWithWebCheckinMsg[]).filter((r) =>
        withCheckIn ? hasCheckinDone(r) : !hasCheckinDone(r)
      );
      if (onlyPendingPaymentMessage) {
        list = list.filter((r) => Number(r.paid_amount ?? 0) < Number(r.total_amount ?? 0));
      }
      const ids = list.map((r) => r.id);
      const clientIds = uniqueNonNullClientIds(
        list.flatMap((r) => [(r as { client_id: string | null }).client_id, (r as { guest_id?: string | null }).guest_id])
      );
      const [clientsRes, chargesRes] = await Promise.all([
        clientIds.length
          ? supabase.from("clients").select("id, full_name, phone").in("id", clientIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string; phone?: string | null }[], error: null }),
        supabase.from("checkin_charges").select("reservation_id, id, status, sent_at").in("reservation_id", ids),
      ]);
      const clientsMap = new Map((clientsRes.data ?? []).map((c: { id: string; full_name: string; phone?: string | null }) => [c.id, { name: c.full_name, phone: c.phone ?? null }]));
      const chargesMap = new Map(
        (chargesRes.data ?? []).map((c: { reservation_id: string; id: string; status: string; sent_at: string | null }) => [
          c.reservation_id,
          { id: c.id, status: c.status, sent_at: c.sent_at },
        ])
      );
      return list.map((r) => {
        const row = r as RowWithWebCheckinMsg & {
          ota_reservations?: OtaGuestRowLite[] | null;
          guest_id?: string | null;
          guest_name?: string | null;
        };
        const { web_checkin: _wc, ota_reservations, ...rest } = row;
        const charge = chargesMap.get(r.id);
        const { guest_name, guest_phone } = guestFieldsFromReservationAndClients(
          {
            client_id: row.client_id,
            guest_id: row.guest_id ?? null,
            guest_name: row.guest_name ?? null,
            ota_reservations: ota_reservations ?? null,
          },
          clientsMap
        );
        return {
          ...rest,
          guest_name,
          guest_phone,
          charge_id: charge?.id ?? null,
          charge_status: charge?.status ?? null,
          charge_sent_at: charge?.sent_at ?? null,
        } as PendingReservationRow;
      });
    },
    enabled: !!establishmentUuid && isEnabled && !!messageDateFilter,
  });

  // Reservas com checkout na data selecionada (aba Lembrete de checkout)
  const { data: checkoutReservationsRaw = [], isLoading: checkoutLoading } = useQuery({
    queryKey: ["checkin_charge_checkout_reservations", establishmentUuid, checkoutDateFilter],
    queryFn: async () => {
      const range = getCheckinDateRange(checkoutDateFilter);
      const { data: reservations, error } = await supabase
        .from("reservations")
        .select(
          "id, reservation_code, checkin_date, checkout_date, total_amount, paid_amount, status, client_id, guest_id, guest_name, ota_reservations(ota_guest_name, ota_guest_phone)"
        )
        .eq("establishment_id", establishmentUuid)
        .gte("checkout_date", range.start)
        .lt("checkout_date", range.end)
        .in("status", ["confirmed", "checkedin"])
        .order("checkout_date", { ascending: true });
      if (error) throw error;
      if (!reservations?.length) return [];
      const ids = (reservations as { id: string }[]).map((r) => r.id);
      const clientIds = uniqueNonNullClientIds(
        (reservations as { client_id: string | null; guest_id?: string | null }[]).flatMap((r) => [r.client_id, r.guest_id])
      );
      const [clientsRes, chargesRes] = await Promise.all([
        clientIds.length
          ? supabase.from("clients").select("id, full_name, phone").in("id", clientIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string; phone?: string | null }[], error: null }),
        supabase.from("checkin_charges").select("reservation_id, id, status, sent_at").in("reservation_id", ids),
      ]);
      const clientsMap = new Map((clientsRes.data ?? []).map((c: { id: string; full_name: string; phone?: string | null }) => [c.id, { name: c.full_name, phone: c.phone ?? null }]));
      const chargesMap = new Map(
        (chargesRes.data ?? []).map((c: { reservation_id: string; id: string; status: string; sent_at: string | null }) => [
          c.reservation_id,
          { id: c.id, status: c.status, sent_at: c.sent_at },
        ])
      );
      return (reservations as PendingReservationRow[]).map((r) => {
        const row = r as PendingReservationRow & {
          ota_reservations?: OtaGuestRowLite[] | null;
          guest_id?: string | null;
          guest_name?: string | null;
        };
        const { ota_reservations, ...restBase } = row;
        const charge = chargesMap.get(r.id);
        const { guest_name, guest_phone } = guestFieldsFromReservationAndClients(
          {
            client_id: row.client_id,
            guest_id: row.guest_id ?? null,
            guest_name: row.guest_name ?? null,
            ota_reservations: ota_reservations ?? null,
          },
          clientsMap
        );
        return {
          ...restBase,
          guest_name,
          guest_phone,
          charge_id: charge?.id ?? null,
          charge_status: charge?.status ?? null,
          charge_sent_at: charge?.sent_at ?? null,
        };
      });
    },
    enabled: !!establishmentUuid && isEnabled && !!checkoutDateFilter,
  });

  const filteredCheckoutReservations = useMemo(() => {
    let list = checkoutReservationsRaw;
    if (guestSearch.trim()) {
      const q = guestSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.guest_name ?? "").toLowerCase().includes(q) || (r.reservation_code ?? "").toLowerCase().includes(q)
      );
    }
    if (filterPaymentStatus !== "all") {
      list = list.filter((r) => {
        const paid = Number(r.paid_amount ?? 0) >= Number(r.total_amount ?? 0) || r.charge_status === "paid";
        return filterPaymentStatus === "paid" ? paid : !paid;
      });
    }
    if (filterMessageSent !== "all") {
      list = list.filter((r) => (filterMessageSent === "yes" ? r.charge_sent_at : !r.charge_sent_at));
    }
    return list;
  }, [checkoutReservationsRaw, guestSearch, filterPaymentStatus, filterMessageSent]);

  const filteredMessageReservations = useMemo(() => {
    let list = messageReservationsRaw;
    if (guestSearch.trim()) {
      const q = guestSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.guest_name ?? "").toLowerCase().includes(q) || (r.reservation_code ?? "").toLowerCase().includes(q)
      );
    }
    if (filterPaymentStatus !== "all") {
      list = list.filter((r) => {
        const paid = Number(r.paid_amount ?? 0) >= Number(r.total_amount ?? 0) || r.charge_status === "paid";
        return filterPaymentStatus === "paid" ? paid : !paid;
      });
    }
    if (filterMessageSent !== "all") {
      list = list.filter((r) => (filterMessageSent === "yes" ? r.charge_sent_at : !r.charge_sent_at));
    }
    return list;
  }, [messageReservationsRaw, guestSearch, filterPaymentStatus, filterMessageSent]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayRange = getCheckinDateRange(todayStr);
  const { data: summaryCounts } = useQuery({
    queryKey: ["checkin_charge_summary", establishmentUuid, todayStr],
    queryFn: async () => {
      if (!establishmentUuid) return { checkinsToday: 0, pendentesEnvio: 0, pagamentosPendentes: 0, checkoutsToday: 0 };
      const [checkinList, paymentList, checkoutRes, chargesRes] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, web_checkin(status)")
          .eq("establishment_id", establishmentUuid)
          .gte("checkin_date", todayRange.start)
          .lt("checkin_date", todayRange.end)
          .in("status", ["pending", "confirmed"]),
        supabase
          .from("reservations")
          .select("id, paid_amount, total_amount")
          .eq("establishment_id", establishmentUuid)
          .gte("checkin_date", todayRange.start)
          .in("status", ["pending", "unpaid", "confirmed", "checkedin"]),
        supabase
          .from("reservations")
          .select("id")
          .eq("establishment_id", establishmentUuid)
          .gte("checkout_date", todayRange.start)
          .lt("checkout_date", todayRange.end)
          .in("status", ["confirmed", "checkedin"]),
        supabase.from("checkin_charges").select("reservation_id"),
      ]);
      const chargeIds = new Set((chargesRes.data ?? []).map((c: { reservation_id: string }) => c.reservation_id));
      const checkinData = (checkinList as { data?: Array<{ id: string; web_checkin?: { status: string }[] | { status: string } }> })?.data ?? [];
      const withCheckin = checkinData.filter(
        (r) => !(Array.isArray(r.web_checkin) ? r.web_checkin : r.web_checkin ? [r.web_checkin] : []).some((w) => w?.status === "completed")
      );
      const pendentesEnvio = withCheckin.filter((r) => !chargeIds.has(r.id)).length;
      const paymentData = (paymentList as { data?: Array<{ paid_amount?: number; total_amount?: number }> })?.data ?? [];
      const pagamentosPendentes = paymentData.filter((r) => Number(r.paid_amount ?? 0) < Number(r.total_amount ?? 0)).length;
      const checkoutData = (checkoutRes as { data?: unknown[] })?.data ?? [];
      return {
        checkinsToday: withCheckin.length,
        pendentesEnvio,
        pagamentosPendentes,
        checkoutsToday: checkoutData.length,
      };
    },
    enabled: !!establishmentUuid && isEnabled,
  });

  useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled);
    setSendTiming(config.send_timing as SendTiming);
    setDaysBeforeCheckin(config.days_before_checkin ?? 3);
    setAmountType(config.amount_type as AmountType);
    setAmountValue(config.amount_value != null ? String(config.amount_value) : "");
    setDueDateDays(config.due_date_days ?? 3);
    setChannel(config.channel as ChannelType);
    setChannelConfig((config.channel_config as Record<string, unknown>) ?? {});
    setTemplateId(config.template_id);
    setTemplateSource((config.template_source as TemplateSource) ?? "internal");
    setChatwootCannedResponseId(config.chatwoot_canned_response_id ?? null);
    setChatwootCannedResponseShortCode(config.chatwoot_canned_response_short_code ?? "");
    const cc = (config.channel_config as Record<string, unknown>) ?? {};
    const byIntent = (cc.meta_templates_by_intent as Partial<Record<MetaIntentKey, Partial<MetaTemplateSelection>>>) ?? {};
    const fallbackVars =
      Array.isArray(config.meta_template_body_variables)
        ? config.meta_template_body_variables.join(", ")
        : DEFAULT_META_TEMPLATES_BY_INTENT.fallback.variables;
    setMetaTemplatesByIntent({
      checkin_reminder: {
        ...DEFAULT_META_TEMPLATES_BY_INTENT.checkin_reminder,
        ...(byIntent.checkin_reminder ?? {}),
      },
      payment_pending: {
        ...DEFAULT_META_TEMPLATES_BY_INTENT.payment_pending,
        ...(byIntent.payment_pending ?? {}),
      },
      checkout_reminder: {
        ...DEFAULT_META_TEMPLATES_BY_INTENT.checkout_reminder,
        ...(byIntent.checkout_reminder ?? {}),
      },
      reservation_modified: {
        ...DEFAULT_META_TEMPLATES_BY_INTENT.reservation_modified,
        ...(byIntent.reservation_modified ?? {}),
      },
      reservation_cancelled: {
        ...DEFAULT_META_TEMPLATES_BY_INTENT.reservation_cancelled,
        ...(byIntent.reservation_cancelled ?? {}),
      },
      reservation_overbooking: {
        ...DEFAULT_META_TEMPLATES_BY_INTENT.reservation_overbooking,
        ...(byIntent.reservation_overbooking ?? {}),
      },
      fallback: {
        ...DEFAULT_META_TEMPLATES_BY_INTENT.fallback,
        name: config.meta_template_name ?? byIntent.fallback?.name ?? "",
        language: config.meta_template_language ?? byIntent.fallback?.language ?? "pt_BR",
        variables: fallbackVars || byIntent.fallback?.variables || DEFAULT_META_TEMPLATES_BY_INTENT.fallback.variables,
      },
    });
    setPaymentLinkExpiresDays(config.payment_link_expires_days ?? 7);
    setTemplateIdReminder(config.template_id_reminder ?? null);
    setTemplateIdPayment(config.template_id_payment ?? null);
    setTemplateIdCheckout(config.template_id_checkout ?? null);
    setTemplateIdModified(config.template_id_modified ?? null);
    setTemplateIdCancelled(config.template_id_cancelled ?? null);
    setTemplateIdOverbooking(config.template_id_overbooking ?? null);
  }, [config]);

  const { data: channelTemplates, isLoading: channelTemplatesLoading, isFetching: channelTemplatesFetching, refetch: refetchChannelTemplates } = useQuery({
    queryKey: ["list-channel-templates", establishmentUuid, channel],
    queryFn: async () => {
      const { data, error } = await invokePmsFunction("list-channel-templates", {
        body: { establishment_id: establishmentUuid },
      });
      if (error) throw error;
      return (data ?? { internal: [], meta: [], chatwoot: [] }) as {
        internal: Array<{ id: string; name: string; body: string }>;
        meta?: Array<{ name: string; language: string; status?: string }>;
        chatwoot?: Array<{ id: number; short_code: string; content: string }>;
        chatwoot_inbox?: { id: number; channel_type?: string; provider?: string; is_whatsapp_cloud: boolean };
      };
    },
    enabled: !!establishmentUuid && !!config && (channel === "whatsapp_cloud" || channel === "chatwoot"),
  });
  const chatwootSupportsMeta = channel === "chatwoot" && channelTemplates?.chatwoot_inbox?.is_whatsapp_cloud === true;
  const metaAvailableForCurrentChannel = channel === "whatsapp_cloud" || chatwootSupportsMeta;

  const updateMetaIntent = (intent: MetaIntentKey, patch: Partial<MetaTemplateSelection>) => {
    setMetaTemplatesByIntent((prev) => ({
      ...prev,
      [intent]: {
        ...prev[intent],
        ...patch,
      },
    }));
  };

  const saveConfig = async () => {
    if (!establishmentUuid) return;
    setConfigSaving(true);
    try {
      const normalizedMetaByIntent: MetaTemplatesByIntent = {
        checkin_reminder: {
          name: metaTemplatesByIntent.checkin_reminder.name.trim(),
          language: (metaTemplatesByIntent.checkin_reminder.language || "pt_BR").trim(),
          variables: metaTemplatesByIntent.checkin_reminder.variables.trim(),
        },
        payment_pending: {
          name: metaTemplatesByIntent.payment_pending.name.trim(),
          language: (metaTemplatesByIntent.payment_pending.language || "pt_BR").trim(),
          variables: metaTemplatesByIntent.payment_pending.variables.trim(),
        },
        checkout_reminder: {
          name: metaTemplatesByIntent.checkout_reminder.name.trim(),
          language: (metaTemplatesByIntent.checkout_reminder.language || "pt_BR").trim(),
          variables: metaTemplatesByIntent.checkout_reminder.variables.trim(),
        },
        reservation_modified: {
          name: metaTemplatesByIntent.reservation_modified.name.trim(),
          language: (metaTemplatesByIntent.reservation_modified.language || "pt_BR").trim(),
          variables: metaTemplatesByIntent.reservation_modified.variables.trim(),
        },
        reservation_cancelled: {
          name: metaTemplatesByIntent.reservation_cancelled.name.trim(),
          language: (metaTemplatesByIntent.reservation_cancelled.language || "pt_BR").trim(),
          variables: metaTemplatesByIntent.reservation_cancelled.variables.trim(),
        },
        reservation_overbooking: {
          name: metaTemplatesByIntent.reservation_overbooking.name.trim(),
          language: (metaTemplatesByIntent.reservation_overbooking.language || "pt_BR").trim(),
          variables: metaTemplatesByIntent.reservation_overbooking.variables.trim(),
        },
        fallback: {
          name: metaTemplatesByIntent.fallback.name.trim(),
          language: (metaTemplatesByIntent.fallback.language || "pt_BR").trim(),
          variables: metaTemplatesByIntent.fallback.variables.trim(),
        },
      };
      const channelConfigForSave =
        templateSource === "meta"
          ? {
              ...channelConfig,
              meta_templates_by_intent: normalizedMetaByIntent,
            }
          : channelConfig;
      const fallbackMetaVars = normalizedMetaByIntent.fallback.variables
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        establishment_id: establishmentUuid,
        enabled,
        send_timing: sendTiming,
        days_before_checkin: sendTiming === "days_before_checkin" ? daysBeforeCheckin : null,
        amount_type: amountType,
        amount_value: amountType === "total" ? null : (amountValue ? Number(amountValue) : null),
        due_date_days: dueDateDays,
        channel,
        channel_config: channelConfigForSave,
        template_id: templateSource === "internal" ? (templateId || null) : null,
        template_source: templateSource,
        meta_template_name: templateSource === "meta" ? normalizedMetaByIntent.fallback.name || null : null,
        meta_template_language: templateSource === "meta" ? normalizedMetaByIntent.fallback.language || null : null,
        meta_template_body_variables:
          templateSource === "meta" ? fallbackMetaVars : null,
        chatwoot_canned_response_id: templateSource === "chatwoot" ? chatwootCannedResponseId : null,
        chatwoot_canned_response_short_code: templateSource === "chatwoot" ? (chatwootCannedResponseShortCode || null) : null,
        payment_link_expires_days: paymentLinkExpiresDays,
        template_id_reminder: templateSource === "internal" ? (templateIdReminder || null) : null,
        template_id_payment: templateSource === "internal" ? (templateIdPayment || null) : null,
        template_id_checkout: templateSource === "internal" ? (templateIdCheckout || null) : null,
        template_id_modified: templateSource === "internal" ? (templateIdModified || null) : null,
        template_id_cancelled: templateSource === "internal" ? (templateIdCancelled || null) : null,
        template_id_overbooking: templateSource === "internal" ? (templateIdOverbooking || null) : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("checkin_charge_config")
        .upsert(payload, { onConflict: "establishment_id" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["checkin_charge_config", establishmentUuid] });
      toast.success("Configuração salva.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateBody(DEFAULT_TEMPLATE_CHECKIN);
    setTemplateType("checkin_reminder");
    setTemplateIsDefault(templates.length === 0);
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (t: CheckinChargeTemplateRow) => {
    setEditingTemplate(t);
    setTemplateName(t.name);
    setTemplateBody(t.body);
    setTemplateType((t.template_type as TemplateType) || "custom");
    setTemplateIsDefault(t.is_default);
    setTemplateDialogOpen(true);
  };

  const insertTemplateVariable = (varName: string) => {
    const placeholder = `{{${varName}}}`;
    const ta = templateBodyRef.current;
    if (ta) {
      const start = ta.selectionStart ?? templateBody.length;
      const end = ta.selectionEnd ?? start;
      const next = templateBody.slice(0, start) + placeholder + templateBody.slice(end);
      setTemplateBody(next);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + placeholder.length, start + placeholder.length); }, 0);
    } else {
      setTemplateBody((prev) => prev + placeholder);
    }
  };

  const saveTemplate = async () => {
    if (!establishmentUuid || !templateName.trim() || !templateBody.trim()) {
      toast.error("Preencha nome e corpo do template.");
      return;
    }
    try {
      if (editingTemplate) {
        const updates: Partial<CheckinChargeTemplateRow> = {
          name: templateName.trim(),
          body: templateBody.trim(),
          template_type: templateType,
          is_default: templateIsDefault,
          updated_at: new Date().toISOString(),
        };
        if (templateIsDefault) {
          await supabase
            .from("checkin_charge_templates")
            .update({ is_default: false })
            .eq("establishment_id", establishmentUuid);
        }
        const { error } = await supabase
          .from("checkin_charge_templates")
          .update(updates)
          .eq("id", editingTemplate.id);
        if (error) throw error;
        toast.success("Template atualizado.");
      } else {
        if (templateIsDefault) {
          await supabase
            .from("checkin_charge_templates")
            .update({ is_default: false })
            .eq("establishment_id", establishmentUuid);
        }
        const { error } = await supabase.from("checkin_charge_templates").insert({
          establishment_id: establishmentUuid,
          name: templateName.trim(),
          body: templateBody.trim(),
          template_type: templateType,
          is_default: templateIsDefault,
        });
        if (error) throw error;
        toast.success("Template criado.");
      }
      setTemplateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["checkin_charge_templates", establishmentUuid] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase.from("checkin_charge_templates").delete().eq("id", id);
      if (error) throw error;
      toast.success("Template removido.");
      setDeleteTemplateId(null);
      queryClient.invalidateQueries({ queryKey: ["checkin_charge_templates", establishmentUuid] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const setDefaultTemplate = async (id: string) => {
    if (!establishmentUuid) return;
    try {
      await supabase
        .from("checkin_charge_templates")
        .update({ is_default: false })
        .eq("establishment_id", establishmentUuid);
      const { error } = await supabase
        .from("checkin_charge_templates")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Template definido como padrão.");
      queryClient.invalidateQueries({ queryKey: ["checkin_charge_templates", establishmentUuid] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlePhoneOverride = (reservationId: string, phone: string) => {
    setPhoneOverrides((prev) => {
      const next = { ...prev };
      if (phone.trim()) next[reservationId] = phone.trim();
      else delete next[reservationId];
      return next;
    });
  };

  const sendChargeForReservations = async (
    reservationIds: string[],
    intent?: "checkin_reminder" | "payment_pending" | "checkout_reminder" | "reservation_modified" | "reservation_cancelled" | "reservation_overbooking",
    options?: { template_id_override?: string | null; phone_overrides?: Record<string, string> }
  ) => {
    if (!reservationIds.length) {
      toast.error("Selecione ao menos uma reserva.");
      return;
    }
    setSendingCharge(true);
    try {
      const body: { reservation_ids: string[]; intent?: string; template_id_override?: string; phone_overrides?: Record<string, string> } = { reservation_ids: reservationIds };
      if (intent) body.intent = intent;
      if (options?.template_id_override) body.template_id_override = options.template_id_override;
      if (options?.phone_overrides && Object.keys(options.phone_overrides).length > 0) body.phone_overrides = options.phone_overrides;
      const { data, error } = await invokePmsFunction("send-checkin-charge", {
        body,
      });
      if (error) throw error;
      const results = (data as { results?: Array<{ reservation_id: string; success: boolean; error?: string }> })?.results ?? [];
      const ok = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success);
      const successMsg =
        intent === "checkin_reminder"
          ? `Lembrete de check-in enviado para ${ok} reserva(s). O template configurado foi usado com o link de pagamento/check-in.`
          : intent === "payment_pending"
            ? `Cobrança enviada para ${ok} reserva(s). O template configurado foi usado com o link de pagamento.`
            : intent === "checkout_reminder"
              ? `Lembrete de checkout enviado para ${ok} reserva(s).`
              : intent === "reservation_modified"
                ? `Aviso de reserva modificada enviado para ${ok} reserva(s).`
                : intent === "reservation_cancelled"
                  ? `Aviso de reserva cancelada enviado para ${ok} reserva(s).`
                : intent === "reservation_overbooking"
                  ? `Aviso de overbooking enviado para ${ok} reserva(s).`
              : `Mensagem enviada para ${ok} reserva(s). O template selecionado foi usado.`;
      if (fail.length > 0) {
        toast.warning(`${ok} enviada(s). Falha(s): ${fail.map((f) => f.error).join("; ")}`);
      } else {
        toast.success(successMsg);
      }
      setSelectedReservationIds([]);
      setPhoneOverrides({});
      queryClient.invalidateQueries({ queryKey: ["checkin_charge_pending_reservations", establishmentUuid, onlyWithoutPayment, checkinDateFilter] });
      queryClient.invalidateQueries({ queryKey: ["checkin_charge_pending_payments", establishmentUuid, paymentListView, includeCheckedInPayment] });
      queryClient.invalidateQueries({ queryKey: ["checkin_charge_checkout_reservations", establishmentUuid, checkoutDateFilter] });
      queryClient.invalidateQueries({ queryKey: ["checkin_charge_message_reservations", establishmentUuid, messageDateFilter, includeCheckedInMessage, onlyPendingPaymentMessage] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSendingCharge(false);
    }
  };

  const toggleReservationSelection = (id: string) => {
    setSelectedReservationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleSelectAllReservations = () => {
    if (selectedReservationIds.length >= pendingReservations.length) {
      setSelectedReservationIds([]);
    } else {
      setSelectedReservationIds(pendingReservations.map((r) => r.id));
    }
  };

  const setChannelConfigField = (key: string, value: string | number) => {
    setChannelConfig((prev) => ({ ...prev, [key]: value }));
  };

  if (!isEnabled) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-muted-foreground">
            Mensagens & Cobranças não está habilitado para esta empresa. Entre em contato com o administrador do sistema.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className={embedded ? "p-4 space-y-4" : "p-6 space-y-6"}>
      {!embedded && (
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#25D366]/10 ring-1 ring-[#25D366]/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" fill="#25D366" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Mensagens & Cobranças</h1>
          <p className="text-sm text-muted-foreground">
            Configure lembretes de check-in, cobranças e mensagens por WhatsApp, Chatwoot ou Evolution API.
          </p>
        </div>
        <Link to={`/${establishmentId}/cobranca-checkin/ajuda`}>
          <Button variant="outline" size="sm">
            <HelpCircle className="h-4 w-4 mr-2" />
            Ajuda
          </Button>
        </Link>
      </div>
      )}
      {embedded && (
        <p className="text-xs text-muted-foreground px-1">
          Clique em uma reserva para carregar o contexto CRM 360 ao lado. Envios usam o canal já configurado.
        </p>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden p-0">
          <div className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <CalendarCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Check-ins do dia</p>
              <p className="text-2xl font-bold text-foreground">{summaryCounts?.checkinsToday ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="rounded-2xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden p-0">
          <div className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <Send className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pendentes de envio</p>
              <p className="text-2xl font-bold text-foreground">{summaryCounts?.pendentesEnvio ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="rounded-2xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden p-0">
          <div className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pagamentos pendentes</p>
              <p className="text-2xl font-bold text-foreground">{summaryCounts?.pagamentosPendentes ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="rounded-2xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden p-0">
          <div className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Checkouts do dia</p>
              <p className="text-2xl font-bold text-foreground">{summaryCounts?.checkoutsToday ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="reservas" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 p-2 rounded-2xl bg-muted/40 border border-border/60 shadow-inner">
          <TabsTrigger
            value="reservas"
            className="rounded-xl gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-4 py-2.5"
          >
            <Bell className="h-4 w-4" />
            Lembrete de check-in
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs data-[state=active]:bg-primary-foreground/20">
              {pendingReservations.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="pendentes"
            className="rounded-xl gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-4 py-2.5"
          >
            <Wallet className="h-4 w-4" />
            Pagamentos pendentes
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs data-[state=active]:bg-primary-foreground/20">
              {pendingPaymentsOnlyReservations.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="checkout"
            className="rounded-xl gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-4 py-2.5"
          >
            <CalendarCheck className="h-4 w-4" />
            Lembrete de checkout
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs data-[state=active]:bg-primary-foreground/20">
              {checkoutReservationsRaw.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="mensagem"
            className="rounded-xl gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-4 py-2.5"
          >
            <MessageSquare className="h-4 w-4" />
            Mensagem personalizada
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs data-[state=active]:bg-primary-foreground/20">
              {messageReservationsRaw.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="rounded-xl gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-4 py-2.5"
          >
            <FileText className="h-4 w-4" />
            Templates
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs data-[state=active]:bg-primary-foreground/20">
              {templates.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="resumo-dia"
            className="rounded-xl gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-4 py-2.5"
          >
            <LayoutList className="h-4 w-4" />
            Resumo do dia
          </TabsTrigger>
          <TabsTrigger
            value="config"
            className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-4 py-2.5"
          >
            Configuração
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card className="p-6 rounded-2xl border shadow-sm">
            {configLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Ativar Mensagens & Cobranças</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando ativo, o sistema pode enviar cobrança e link de pagamento ao hóspede conforme a regra de envio.
                    </p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Momento do envio</Label>
                    <Select value={sendTiming} onValueChange={(v) => setSendTiming(v as SendTiming)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="after_confirmation">Após confirmação da reserva</SelectItem>
                        <SelectItem value="days_before_checkin">X dias antes do check-in</SelectItem>
                        <SelectItem value="after_ota">Após reserva OTA</SelectItem>
                        <SelectItem value="manual">Apenas manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {sendTiming === "days_before_checkin" && (
                    <div className="space-y-2">
                      <Label>Dias antes do check-in</Label>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={daysBeforeCheckin}
                        onChange={(e) => setDaysBeforeCheckin(Number(e.target.value) || 1)}
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo de valor</Label>
                    <Select value={amountType} onValueChange={(v) => setAmountType(v as AmountType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">Total da reserva</SelectItem>
                        <SelectItem value="percent">Percentual do total</SelectItem>
                        <SelectItem value="fixed">Valor fixo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(amountType === "percent" || amountType === "fixed") && (
                    <div className="space-y-2">
                      <Label>{amountType === "percent" ? "Percentual (%)" : "Valor fixo (R$)"}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={amountType === "percent" ? 1 : 0.01}
                        value={amountValue}
                        onChange={(e) => setAmountValue(e.target.value)}
                        placeholder={amountType === "percent" ? "Ex: 30" : "Ex: 150.00"}
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Dias para vencimento</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={dueDateDays}
                      onChange={(e) => setDueDateDays(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Link de pagamento expira em (dias)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={paymentLinkExpiresDays}
                      onChange={(e) => setPaymentLinkExpiresDays(Number(e.target.value) || 7)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Canal de envio</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as ChannelType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CHANNEL_LABELS) as ChannelType[]).map((ch) => (
                        <SelectItem key={ch} value={ch}>
                          {CHANNEL_LABELS[ch]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Meta: templates oficiais WhatsApp (variáveis: nome, localizador, link check-in / cobrança: link pagamento). Chatwoot pode usar inbox conectado à Evolution API para enviar WhatsApp sem Meta.
                  </p>
                </div>

                {/* Channel-specific config */}
                {channel === "whatsapp_cloud" && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <Label className="text-base">WhatsApp Cloud API</Label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Phone ID</Label>
                        <Input
                          placeholder="ID do número de telefone (Meta)"
                          value={(channelConfig.phone_id as string) ?? ""}
                          onChange={(e) => setChannelConfigField("phone_id", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>WhatsApp Business Account ID (WABA)</Label>
                        <Input
                          placeholder="ID da conta Business (para listar templates)"
                          value={(channelConfig.waba_id as string) ?? ""}
                          onChange={(e) => setChannelConfigField("waba_id", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Obrigatório para usar templates oficiais da Meta.</p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Access Token</Label>
                        <Input
                          type="password"
                          placeholder="Token de acesso permanente"
                          value={(channelConfig.access_token as string) ?? ""}
                          onChange={(e) => setChannelConfigField("access_token", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {channel === "chatwoot" && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <Label className="text-base">Chatwoot</Label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>URL base</Label>
                        <Input
                          placeholder="https://app.chatwoot.com"
                          value={(channelConfig.base_url as string) ?? ""}
                          onChange={(e) => setChannelConfigField("base_url", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Account ID</Label>
                        <Input
                          type="number"
                          placeholder="ID da conta"
                          value={channelConfig.account_id != null ? String(channelConfig.account_id) : ""}
                          onChange={(e) => setChannelConfigField("account_id", e.target.value ? Number(e.target.value) : 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Inbox ID</Label>
                        <Input
                          type="number"
                          placeholder="ID do inbox"
                          value={channelConfig.inbox_id != null ? String(channelConfig.inbox_id) : ""}
                          onChange={(e) => setChannelConfigField("inbox_id", e.target.value ? Number(e.target.value) : 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>API Key</Label>
                        <Input
                          type="password"
                          placeholder="api_access_token"
                          value={(channelConfig.api_key as string) ?? ""}
                          onChange={(e) => setChannelConfigField("api_key", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {channel === "evolution_api" && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <Label className="text-base">Evolution API</Label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>URL base</Label>
                        <Input
                          placeholder="https://sua-instancia.evolution-api.com"
                          value={(channelConfig.base_url as string) ?? ""}
                          onChange={(e) => setChannelConfigField("base_url", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Nome da instância</Label>
                        <Input
                          placeholder="nome-da-instancia"
                          value={(channelConfig.instance as string) ?? ""}
                          onChange={(e) => setChannelConfigField("instance", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {channel === "webhook" && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <Label className="text-base">Webhook</Label>
                    <div className="space-y-2">
                      <Label>URL (POST)</Label>
                      <Input
                        placeholder="https://seu-servidor.com/webhook"
                        value={(channelConfig.url as string) ?? ""}
                        onChange={(e) => setChannelConfigField("url", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        O webhook receberá POST com: to, message, reservation_id
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border p-4 space-y-4 bg-muted/10">
                  <Label className="text-base">Resumo do dia</Label>
                  <p className="text-sm text-muted-foreground">
                    Envio de resumo (checkouts do dia, manutenções e bloqueios criados no dia) para um grupo no Chatwoot ou para números no WhatsApp Cloud. Use a aba &quot;Resumo do dia&quot; para disparar o envio manual ou ative o envio automático no horário desejado.
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="daily-digest-automate"
                        checked={channelConfig.daily_digest_automate === true}
                        onCheckedChange={(v) => setChannelConfig((prev) => ({ ...prev, daily_digest_automate: v }))}
                      />
                      <Label htmlFor="daily-digest-automate" className="cursor-pointer">Automatizar envio do resumo do dia</Label>
                    </div>
                    {channelConfig.daily_digest_automate === true && (
                      <div className="flex items-center gap-2">
                        <Label className="text-muted-foreground whitespace-nowrap">Horário de envio:</Label>
                        <Input
                          type="time"
                          value={(channelConfig.daily_digest_time as string) || "08:00"}
                          onChange={(e) => setChannelConfig((prev) => ({ ...prev, daily_digest_time: e.target.value || "08:00" }))}
                          className="w-[120px]"
                        />
                        <span className="text-xs text-muted-foreground">(horário de Brasília)</span>
                      </div>
                    )}
                  </div>
                  {channel === "chatwoot" && (
                    <div className="space-y-2">
                      <Label>ID da conversa (grupo) no Chatwoot</Label>
                      <Input
                        type="number"
                        placeholder="Ex: 123 (ID da conversa/grupo que receberá o resumo)"
                        value={channelConfig.daily_digest_conversation_id != null ? String(channelConfig.daily_digest_conversation_id) : ""}
                        onChange={(e) => setChannelConfigField("daily_digest_conversation_id", e.target.value ? Number(e.target.value) : 0)}
                        className="max-w-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        No Chatwoot, abra a conversa/grupo desejada e use o ID da URL (ex.: /accounts/1/conversations/123 → use 123).
                      </p>
                    </div>
                  )}
                  {channel === "whatsapp_cloud" && (
                    <div className="space-y-2">
                      <Label>Números para envio do resumo (um por linha)</Label>
                      <Textarea
                        placeholder="5511999999999&#10;5521988888888"
                        value={Array.isArray(channelConfig.daily_digest_phones) ? (channelConfig.daily_digest_phones as string[]).join("\n") : (channelConfig.daily_digest_phones as string) ?? ""}
                        onChange={(e) => setChannelConfigField("daily_digest_phones", e.target.value)}
                        rows={4}
                        className="font-mono text-sm resize-y"
                      />
                      <p className="text-xs text-muted-foreground">
                        Inclua os números (com DDI) que devem receber o resumo do dia via WhatsApp Cloud API. Um número por linha.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <Label className="text-base">Origem do template</Label>
                  <p className="text-sm text-muted-foreground">
                    Internal/Evolution: templates criados aqui. Meta: templates aprovados no WhatsApp. Chatwoot: Canned Responses da conta.
                  </p>
                  {channel === "chatwoot" && (
                    <p className="text-xs text-muted-foreground">
                      Inbox detectada:{" "}
                      {chatwootSupportsMeta
                        ? "WhatsApp Cloud API (templates Meta habilitados)."
                        : "não é WhatsApp Cloud API (templates Meta indisponíveis)."}
                    </p>
                  )}
                  <Select value={templateSource} onValueChange={(v) => setTemplateSource(v as TemplateSource)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Sistema / Evolution API (criar templates abaixo)</SelectItem>
                      <SelectItem value="meta" disabled={!metaAvailableForCurrentChannel}>Meta (WhatsApp oficial)</SelectItem>
                      <SelectItem value="chatwoot" disabled={channel !== "chatwoot"}>Chatwoot (Canned Responses)</SelectItem>
                    </SelectContent>
                  </Select>
                  {templateSource === "internal" && (
                    <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                      <p className="text-sm text-muted-foreground">
                        Escolha o template para cada tipo de ação (Chatwoot/Evolution: use templates com tipo correspondente).
                      </p>
                      <div className="grid gap-4 sm:grid-cols-1">
                        <div className="space-y-2">
                          <Label>Lembrete de check-in</Label>
                          <Select value={templateIdReminder ?? "none"} onValueChange={(v) => setTemplateIdReminder(v === "none" ? null : v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Padrão do sistema" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Padrão do sistema</SelectItem>
                              {templates.filter((t) => !t.template_type || t.template_type === "checkin_reminder" || t.template_type === "custom").map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} {t.is_default ? "(padrão)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Pagamento pendente</Label>
                          <Select value={templateIdPayment ?? "none"} onValueChange={(v) => setTemplateIdPayment(v === "none" ? null : v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Padrão do sistema" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Padrão do sistema</SelectItem>
                              {templates.filter((t) => !t.template_type || t.template_type === "payment_pending" || t.template_type === "custom").map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} {t.is_default ? "(padrão)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Lembrete de checkout</Label>
                          <Select value={templateIdCheckout ?? "none"} onValueChange={(v) => setTemplateIdCheckout(v === "none" ? null : v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Padrão do sistema" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Padrão do sistema</SelectItem>
                              {templates.filter((t) => !t.template_type || t.template_type === "checkout_reminder" || t.template_type === "custom").map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} {t.is_default ? "(padrão)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Reserva modificada</Label>
                          <Select value={templateIdModified ?? "none"} onValueChange={(v) => setTemplateIdModified(v === "none" ? null : v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Padrão do sistema" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Padrão do sistema</SelectItem>
                              {templates.filter((t) => !t.template_type || t.template_type === "reservation_modified" || t.template_type === "custom").map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} {t.is_default ? "(padrão)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Reserva cancelada</Label>
                          <Select value={templateIdCancelled ?? "none"} onValueChange={(v) => setTemplateIdCancelled(v === "none" ? null : v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Padrão do sistema" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Padrão do sistema</SelectItem>
                              {templates.filter((t) => !t.template_type || t.template_type === "reservation_cancelled" || t.template_type === "custom").map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} {t.is_default ? "(padrão)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Overbooking</Label>
                          <Select value={templateIdOverbooking ?? "none"} onValueChange={(v) => setTemplateIdOverbooking(v === "none" ? null : v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Padrão do sistema" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Padrão do sistema</SelectItem>
                              {templates.filter((t) => !t.template_type || t.template_type === "reservation_overbooking" || t.template_type === "custom").map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} {t.is_default ? "(padrão)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Template geral (fallback)</Label>
                        <Select value={templateId ?? "none"} onValueChange={(v) => setTemplateId(v === "none" ? null : v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Template padrão do sistema" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Template padrão do sistema</SelectItem>
                            {templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name} {t.is_default ? "(padrão)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {templateSource === "meta" && metaAvailableForCurrentChannel && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/10">
                        <p className="text-xs text-muted-foreground">
                          Sincronize para buscar os templates mais recentes aprovados no canal atual.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={channelTemplatesFetching}
                          onClick={async () => {
                            const { error } = await refetchChannelTemplates();
                            if (error) {
                              toast.error("Falha ao sincronizar templates Meta.");
                              return;
                            }
                            toast.success("Templates Meta sincronizados.");
                          }}
                        >
                          {channelTemplatesFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Sincronizar templates Meta
                        </Button>
                      </div>
                      {([
                        ["checkin_reminder", "Lembrete de check-in"],
                        ["payment_pending", "Pagamento pendente"],
                        ["checkout_reminder", "Lembrete de checkout"],
                        ["reservation_modified", "Reserva modificada"],
                        ["reservation_cancelled", "Reserva cancelada"],
                        ["reservation_overbooking", "Overbooking"],
                        ["fallback", "Template geral (fallback)"],
                      ] as Array<[MetaIntentKey, string]>).map(([intentKey, intentLabel]) => (
                        <div key={intentKey} className="space-y-3 rounded-lg border p-4 bg-muted/20">
                          <Label className="text-sm">{intentLabel}</Label>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Template Meta</Label>
                              <Select
                                value={metaTemplatesByIntent[intentKey].name ? `${metaTemplatesByIntent[intentKey].name}|${metaTemplatesByIntent[intentKey].language || "pt_BR"}` : "none"}
                                onValueChange={(v) => {
                                  if (v === "none") {
                                    updateMetaIntent(intentKey, { name: "" });
                                    return;
                                  }
                                  const [name, lang] = v.split("|");
                                  updateMetaIntent(intentKey, { name: name || "", language: lang || "pt_BR" });
                                }}
                                disabled={channelTemplatesLoading}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Carregar templates..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Selecione um template</SelectItem>
                                  {(channelTemplates?.meta ?? []).map((t) => (
                                    <SelectItem key={`${intentKey}-${t.name}-${t.language}`} value={`${t.name}|${t.language || "pt_BR"}`}>
                                      {t.name} ({t.language})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Idioma do template</Label>
                              <Input
                                value={metaTemplatesByIntent[intentKey].language}
                                onChange={(e) => updateMetaIntent(intentKey, { language: e.target.value })}
                                placeholder="pt_BR"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Variáveis do body ({`{{1}}, {{2}}, ...`})</Label>
                            <Input
                              value={metaTemplatesByIntent[intentKey].variables}
                              onChange={(e) => updateMetaIntent(intentKey, { variables: e.target.value })}
                              placeholder="guest_name, reservation_code, payment_link, ..."
                              className="font-mono text-sm"
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        Variáveis disponíveis: guest_name, reservation_code, localizador, checkin_date, checkout_date, amount, payment_link, web_checkin_link, establishment_name, establishment_address.
                      </p>
                    </div>
                  )}
                  {templateSource === "chatwoot" && channel === "chatwoot" && (
                    <div className="space-y-2">
                      <Label>Canned Response (Chatwoot)</Label>
                      <Select
                        value={chatwootCannedResponseId != null ? String(chatwootCannedResponseId) : (chatwootCannedResponseShortCode || "none")}
                        onValueChange={(v) => {
                          if (v === "none") { setChatwootCannedResponseId(null); setChatwootCannedResponseShortCode(""); return; }
                          const c = (channelTemplates?.chatwoot ?? []).find((x) => String(x.id) === v || x.short_code === v);
                          if (c) { setChatwootCannedResponseId(c.id); setChatwootCannedResponseShortCode(c.short_code); }
                        }}
                        disabled={channelTemplatesLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Carregar Canned Responses..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione uma resposta rápida</SelectItem>
                          {(channelTemplates?.chatwoot ?? []).map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.short_code} – {c.content?.slice(0, 40)}…
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveConfig} disabled={configSaving}>
                    {configSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar configuração
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reservas" className="space-y-4">
          <Card className="overflow-hidden border-0 shadow-lg rounded-2xl shadow-black/5 bg-card">
            <div className="border-b bg-muted/30 px-6 py-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Lembrete de check-in
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Hóspedes que ainda não realizaram check-in. Envie o lembrete com o template configurado e o link de pagamento/check-in.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="checkin-date-filter" className="text-sm whitespace-nowrap">Data do check-in</Label>
                  <Input
                    id="checkin-date-filter"
                    type="date"
                    value={checkinDateFilter}
                    onChange={(e) => setCheckinDateFilter(e.target.value)}
                    className="w-[160px] rounded-lg"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={onlyWithoutPayment}
                    onCheckedChange={(v) => setOnlyWithoutPayment(!!v)}
                  />
                  <span className="text-sm">Apenas com valor pendente</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por hóspede ou código..."
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    className="pl-9 rounded-lg h-9"
                  />
                </div>
                <Select value={filterPaymentStatus} onValueChange={(v) => setFilterPaymentStatus(v as "all" | "paid" | "pending")}>
                  <SelectTrigger className="w-[140px] rounded-lg h-9">
                    <SelectValue placeholder="Status pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterMessageSent} onValueChange={(v) => setFilterMessageSent(v as "all" | "yes" | "no")}>
                  <SelectTrigger className="w-[160px] rounded-lg h-9">
                    <SelectValue placeholder="Mensagem enviada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="yes">Enviada</SelectItem>
                    <SelectItem value="no">Não enviada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedReservationIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => sendChargeForReservations(selectedReservationIds, "checkin_reminder", { phone_overrides: phoneOverrides })}
                    disabled={sendingCharge}
                    className="rounded-lg shadow-md bg-primary hover:bg-primary/90 gap-2"
                  >
                    {sendingCharge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar lembrete para {selectedReservationIds.length} reserva(s)
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="rounded-lg" disabled={sendingCharge}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => { setSelectedReservationIds(pendingReservations.map((r) => r.id)); }} disabled={sendingCharge}>
                        Selecionar todas ({pendingReservations.length})
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSelectedReservationIds([])}>
                        Limpar seleção
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {pendingLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : pendingReservations.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center rounded-xl bg-muted/30">
                  Nenhuma reserva encontrada para a data selecionada.
                </p>
              ) : (
                <div className="rounded-xl border overflow-hidden shadow-sm">
                  <ReservationsChargeTable
                    list={pendingReservations}
                    selectedIds={selectedReservationIds}
                    onToggleOne={toggleReservationSelection}
                    onToggleAll={() => (selectedReservationIds.length >= pendingReservations.length ? setSelectedReservationIds([]) : setSelectedReservationIds(pendingReservations.map((r) => r.id)))}
                    onSendOne={(id) => sendChargeForReservations([id], "checkin_reminder", { phone_overrides: phoneOverrides })}
                    sendingCharge={sendingCharge}
                    formatCurrency={formatCurrency}
                    format={format}
                    ptBR={ptBR}
                    showPhone
                    phoneOverrides={phoneOverrides}
                    onPhoneOverride={handlePhoneOverride}
                    focusedReservationId={focusedReservationId}
                    onFocusReservation={onFocusReservation}
                  />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pendentes" className="space-y-4">
          <Card className="overflow-hidden border-0 shadow-lg rounded-2xl shadow-black/5 bg-card">
            <div className="border-b bg-muted/30 px-6 py-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                Cobrar pagamentos pendentes
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Reservas com valor pendente (pagamento parcial ou não pago). Envie o link de pagamento com o template de cobrança.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="payment-list-view" className="text-sm whitespace-nowrap">Exibir</Label>
                  <Select value={paymentListView} onValueChange={(v) => setPaymentListView(v as PaymentListView)}>
                    <SelectTrigger id="payment-list-view" className="w-[220px] rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent_and_future">Recentes e futuras (hoje em diante)</SelectItem>
                      <SelectItem value="today_only">Somente do dia atual</SelectItem>
                      <SelectItem value="all">Todas não pagas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeCheckedInPayment}
                    onCheckedChange={(v) => setIncludeCheckedInPayment(!!v)}
                  />
                  <span className="text-sm">Incluir reservas com check-in já realizado</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por hóspede ou código..."
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    className="pl-9 rounded-lg h-9"
                  />
                </div>
                <Select value={filterMessageSent} onValueChange={(v) => setFilterMessageSent(v as "all" | "yes" | "no")}>
                  <SelectTrigger className="w-[160px] rounded-lg h-9">
                    <SelectValue placeholder="Mensagem enviada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="yes">Enviada</SelectItem>
                    <SelectItem value="no">Não enviada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedReservationIds.length > 0 && (
                <Button
                  onClick={() => sendChargeForReservations(selectedReservationIds, "payment_pending", { phone_overrides: phoneOverrides })}
                  disabled={sendingCharge}
                  className="rounded-lg shadow-md bg-primary hover:bg-primary/90 gap-2"
                >
                  {sendingCharge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar cobrança para {selectedReservationIds.length} reserva(s)
                </Button>
              )}
              {pendingPaymentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : pendingPaymentsOnlyReservations.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center rounded-lg bg-muted/30">
                  Nenhuma reserva com pagamento pendente.
                </p>
              ) : (
                <div className="rounded-xl border overflow-hidden shadow-sm">
                  <ReservationsChargeTable
                    list={pendingPaymentsOnlyReservations}
                    selectedIds={selectedReservationIds}
                    onToggleOne={toggleReservationSelection}
                    onToggleAll={() => (selectedReservationIds.length >= pendingPaymentsOnlyReservations.length ? setSelectedReservationIds([]) : setSelectedReservationIds(pendingPaymentsOnlyReservations.map((r) => r.id)))}
                    onSendOne={(id) => sendChargeForReservations([id], "payment_pending", { phone_overrides: phoneOverrides })}
                    sendingCharge={sendingCharge}
                    formatCurrency={formatCurrency}
                    format={format}
                    ptBR={ptBR}
                    showStatus={includeCheckedInPayment}
                    showPhone
                    phoneOverrides={phoneOverrides}
                    onPhoneOverride={handlePhoneOverride}
                    focusedReservationId={focusedReservationId}
                    onFocusReservation={onFocusReservation}
                  />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="checkout" className="space-y-4">
          <Card className="overflow-hidden border-0 shadow-lg rounded-2xl shadow-black/5 bg-card">
            <div className="border-b bg-muted/30 px-6 py-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary" />
                Lembrete de checkout
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Reservas com check-out na data selecionada. Envie o lembrete de checkout com o template configurado.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="checkout-date-filter" className="text-sm whitespace-nowrap">Data do check-out</Label>
                  <Input
                    id="checkout-date-filter"
                    type="date"
                    value={checkoutDateFilter}
                    onChange={(e) => setCheckoutDateFilter(e.target.value)}
                    className="w-[160px] rounded-lg"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por hóspede ou código..."
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    className="pl-9 rounded-lg h-9"
                  />
                </div>
                <Select value={filterPaymentStatus} onValueChange={(v) => setFilterPaymentStatus(v as "all" | "paid" | "pending")}>
                  <SelectTrigger className="w-[140px] rounded-lg h-9">
                    <SelectValue placeholder="Status pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterMessageSent} onValueChange={(v) => setFilterMessageSent(v as "all" | "yes" | "no")}>
                  <SelectTrigger className="w-[160px] rounded-lg h-9">
                    <SelectValue placeholder="Mensagem enviada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="yes">Enviada</SelectItem>
                    <SelectItem value="no">Não enviada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedReservationIds.length > 0 && (
                <Button
                  onClick={() => sendChargeForReservations(selectedReservationIds, "checkout_reminder", { phone_overrides: phoneOverrides })}
                  disabled={sendingCharge}
                  className="rounded-lg shadow-md bg-primary hover:bg-primary/90 gap-2"
                >
                  {sendingCharge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar lembrete de checkout para {selectedReservationIds.length} reserva(s)
                </Button>
              )}
              {checkoutLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCheckoutReservations.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center rounded-lg bg-muted/30">
                  Nenhuma reserva com check-out na data selecionada.
                </p>
              ) : (
                <div className="rounded-xl border overflow-hidden shadow-sm">
                  <ReservationsChargeTable
                    list={filteredCheckoutReservations}
                    selectedIds={selectedReservationIds}
                    onToggleOne={toggleReservationSelection}
                    onToggleAll={() => (selectedReservationIds.length >= filteredCheckoutReservations.length ? setSelectedReservationIds([]) : setSelectedReservationIds(filteredCheckoutReservations.map((r) => r.id)))}
                    onSendOne={(id) => sendChargeForReservations([id], "checkout_reminder", { phone_overrides: phoneOverrides })}
                    sendingCharge={sendingCharge}
                    formatCurrency={formatCurrency}
                    format={format}
                    ptBR={ptBR}
                    showPhone
                    phoneOverrides={phoneOverrides}
                    onPhoneOverride={handlePhoneOverride}
                    useCheckoutDate
                    focusedReservationId={focusedReservationId}
                    onFocusReservation={onFocusReservation}
                  />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="mensagem" className="space-y-4">
          <Card className="overflow-hidden border-0 shadow-lg rounded-2xl shadow-black/5 bg-card">
            <div className="border-b bg-muted/30 px-6 py-4">
              <h3 className="font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Mensagem personalizada
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Reservas do dia: envie mensagem para hóspedes. Use os filtros e escolha o template. Inclui link de pagamento quando aplicável.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="message-date-filter" className="text-sm whitespace-nowrap">Data do check-in</Label>
                  <Input
                    id="message-date-filter"
                    type="date"
                    value={messageDateFilter}
                    onChange={(e) => setMessageDateFilter(e.target.value)}
                    className="w-[160px] rounded-lg"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeCheckedInMessage}
                    onCheckedChange={(v) => setIncludeCheckedInMessage(!!v)}
                  />
                  <span className="text-sm">Incluir reservas com check-in já realizado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={onlyPendingPaymentMessage}
                    onCheckedChange={(v) => setOnlyPendingPaymentMessage(!!v)}
                  />
                  <span className="text-sm">Apenas reservas pendentes de pagamento</span>
                </label>
                <div className="space-y-2 min-w-[200px]">
                  <Label className="text-sm">Template a usar</Label>
                  <Select
                    value={selectedTemplateIdForMessage ?? "none"}
                    onValueChange={(v) => setSelectedTemplateIdForMessage(v === "none" ? null : v)}
                  >
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder="Padrão da configuração" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Padrão da configuração</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por hóspede ou código..."
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    className="pl-9 rounded-lg h-9"
                  />
                </div>
                <Select value={filterPaymentStatus} onValueChange={(v) => setFilterPaymentStatus(v as "all" | "paid" | "pending")}>
                  <SelectTrigger className="w-[140px] rounded-lg h-9">
                    <SelectValue placeholder="Status pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterMessageSent} onValueChange={(v) => setFilterMessageSent(v as "all" | "yes" | "no")}>
                  <SelectTrigger className="w-[160px] rounded-lg h-9">
                    <SelectValue placeholder="Mensagem enviada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="yes">Enviada</SelectItem>
                    <SelectItem value="no">Não enviada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedReservationIds.length > 0 && (
                <Button
                  onClick={() => sendChargeForReservations(selectedReservationIds, undefined, {
                    template_id_override: selectedTemplateIdForMessage ?? undefined,
                    phone_overrides: phoneOverrides,
                  })}
                  disabled={sendingCharge}
                  className="rounded-lg shadow-md bg-primary hover:bg-primary/90 gap-2"
                >
                  {sendingCharge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar mensagem para {selectedReservationIds.length} reserva(s)
                </Button>
              )}
              {messageLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMessageReservations.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center rounded-lg bg-muted/30">
                  Nenhuma reserva encontrada para a data e filtros selecionados.
                </p>
              ) : (
                <div className="rounded-xl border overflow-hidden shadow-sm">
                  <ReservationsChargeTable
                    list={filteredMessageReservations}
                    selectedIds={selectedReservationIds}
                    onToggleOne={toggleReservationSelection}
                    onToggleAll={() => (selectedReservationIds.length >= filteredMessageReservations.length ? setSelectedReservationIds([]) : setSelectedReservationIds(filteredMessageReservations.map((r) => r.id)))}
                    onSendOne={(id) => sendChargeForReservations([id], undefined, { template_id_override: selectedTemplateIdForMessage ?? undefined, phone_overrides: phoneOverrides })}
                    sendingCharge={sendingCharge}
                    formatCurrency={formatCurrency}
                    format={format}
                    ptBR={ptBR}
                    showStatus={includeCheckedInMessage}
                    showPhone
                    phoneOverrides={phoneOverrides}
                    onPhoneOverride={handlePhoneOverride}
                    focusedReservationId={focusedReservationId}
                    onFocusReservation={onFocusReservation}
                  />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="resumo-dia" className="space-y-4">
          <Card className="p-6 rounded-2xl border shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 mb-2">
              <LayoutList className="h-4 w-4 text-primary" />
              Resumo do dia
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Envia para um grupo no Chatwoot (ou para números no WhatsApp Cloud) um resumo com: checkouts do dia, manutenções abertas no dia e bloqueios de quarto criados no dia. Configure o destino e o horário de envio automático em Configuração → Resumo do dia. Quando a automação estiver ativa, é necessário configurar um cron externo (ex.: cron-job.org) para chamar a função <code className="text-xs bg-muted px-1 rounded">send-daily-digest-schedule</code> a cada 15 minutos.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Data do resumo</Label>
                <Input
                  type="date"
                  value={digestDate}
                  onChange={(e) => setDigestDate(e.target.value)}
                  className="rounded-lg max-w-[180px]"
                />
              </div>
              <Button
                onClick={async () => {
                  if (!establishmentUuid) return;
                  setSendingDigest(true);
                  try {
                    const { data, error } = await invokePmsFunction("send-daily-digest", {
                      body: { establishment_id: establishmentUuid, date: digestDate },
                    });
                    if (error) {
                      toast.error(error.message || "Erro ao enviar resumo");
                      return;
                    }
                    const sentChatwoot = (data as { sent_chatwoot?: boolean })?.sent_chatwoot;
                    const sentWhatsapp = (data as { sent_whatsapp?: number })?.sent_whatsapp;
                    const errs = (data as { errors?: string[] })?.errors;
                    if (errs?.length) {
                      toast.error(errs.join(" "));
                      return;
                    }
                    if (sentChatwoot) toast.success("Resumo enviado para o grupo no Chatwoot.");
                    else if (sentWhatsapp && sentWhatsapp > 0) toast.success(`Resumo enviado para ${sentWhatsapp} número(s) no WhatsApp.`);
                    else toast.success("Resumo enviado.");
                  } catch (e) {
                    toast.error((e as Error).message || "Erro ao enviar resumo");
                  } finally {
                    setSendingDigest(false);
                  }
                }}
                disabled={sendingDigest}
                className="rounded-lg gap-2"
              >
                {sendingDigest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar resumo do dia
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card className="overflow-hidden border-0 shadow-lg shadow-black/5 bg-card">
            <div className="border-b bg-muted/30 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Templates de mensagem
                </h3>
                <p className="text-sm text-muted-foreground mt-1 mb-2">Use as variáveis no texto do template (clique em &quot;Novo template&quot; para ver o painel de variáveis).</p>
                <div className="flex flex-wrap gap-1.5">
                  {(TEMPLATE_VARS as readonly string[]).map((v) => {
                    const info = TEMPLATE_VAR_INFO[v];
                    return (
                      <Tooltip key={v}>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                            {`{{${v}}}`}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{info?.label ?? v}</p>
                          {info?.description && <p className="text-xs text-muted-foreground">{info.description}</p>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
              <Button onClick={openNewTemplate} className="shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo template
              </Button>
            </div>
            <div className="p-6">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center rounded-lg bg-muted/30">
                Nenhum template criado. Use o template padrão na configuração ou crie um novo.
              </p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Padrão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {t.template_type === "checkin_reminder"
                            ? "Lembrete check-in"
                            : t.template_type === "payment_pending"
                              ? "Pagamento pendente"
                              : t.template_type === "checkout_reminder"
                                ? "Lembrete checkout"
                                : t.template_type === "reservation_modified"
                                  ? "Reserva modificada"
                                  : t.template_type === "reservation_cancelled"
                                    ? "Reserva cancelada"
                                    : t.template_type === "reservation_overbooking"
                                      ? "Overbooking"
                                    : "Personalizado"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {t.is_default ? (
                          <span className="text-primary font-medium">Padrão</span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefaultTemplate(t.id)}
                            className="text-muted-foreground"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditTemplate(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTemplateId(t.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Editar template" : "Novo template"}</DialogTitle>
              <DialogDescription>
                Crie a mensagem e use as variáveis abaixo. Clique em uma variável para inserir no texto.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-4 overflow-auto">
              <div className="lg:col-span-4 space-y-4">
                <div className="rounded-xl border bg-muted/30 p-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">Variáveis disponíveis</h4>
                  <p className="text-xs text-muted-foreground mb-3">Clique para inserir no corpo da mensagem</p>
                  <div className="flex flex-wrap gap-2">
                    {(TEMPLATE_VARS as readonly string[]).map((v) => {
                      const info = TEMPLATE_VAR_INFO[v] ?? { label: v, description: "" };
                      return (
                        <Tooltip key={v}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => insertTemplateVariable(v)}
                              className="inline-flex flex-col items-start rounded-lg border bg-background px-3 py-2 text-left shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <code className="text-xs font-mono text-primary">{`{{${v}}}`}</code>
                              <span className="text-[10px] text-muted-foreground mt-0.5">{info.label}</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[200px]">
                            <p className="font-medium">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{info.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="lg:col-span-8 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome do template</Label>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Ex: Lembrete check-in padrão"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de template</Label>
                    <Select value={templateType} onValueChange={(v) => setTemplateType(v as TemplateType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checkin_reminder">Lembrete de check-in</SelectItem>
                        <SelectItem value="payment_pending">Pagamento pendente</SelectItem>
                        <SelectItem value="checkout_reminder">Lembrete de checkout</SelectItem>
                        <SelectItem value="reservation_modified">Reserva modificada</SelectItem>
                        <SelectItem value="reservation_cancelled">Reserva cancelada</SelectItem>
                        <SelectItem value="reservation_overbooking">Overbooking</SelectItem>
                        <SelectItem value="custom">Personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Carregar exemplo</Label>
                  <Select
                    value="none"
                    onValueChange={(v) => {
                      if (v === "checkin") { setTemplateBody(DEFAULT_TEMPLATE_CHECKIN); setTemplateType("checkin_reminder"); }
                      else if (v === "pagamento") { setTemplateBody(DEFAULT_TEMPLATE_PAGAMENTO); setTemplateType("payment_pending"); }
                      else if (v === "checkout") { setTemplateBody(DEFAULT_TEMPLATE_CHECKOUT); setTemplateType("checkout_reminder"); }
                      else if (v === "modificada") { setTemplateBody(DEFAULT_TEMPLATE_MODIFICADA); setTemplateType("reservation_modified"); }
                      else if (v === "cancelada") { setTemplateBody(DEFAULT_TEMPLATE_CANCELADA); setTemplateType("reservation_cancelled"); }
                      else if (v === "overbooking") { setTemplateBody(DEFAULT_TEMPLATE_OVERBOOKING); setTemplateType("reservation_overbooking"); }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Não carregar —</SelectItem>
                      <SelectItem value="checkin">Lembrete de check-in</SelectItem>
                      <SelectItem value="pagamento">Pagamento pendente</SelectItem>
                      <SelectItem value="checkout">Lembrete de checkout</SelectItem>
                      <SelectItem value="modificada">Reserva modificada</SelectItem>
                      <SelectItem value="cancelada">Reserva cancelada</SelectItem>
                      <SelectItem value="overbooking">Overbooking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Corpo da mensagem</Label>
                  <Textarea
                    ref={templateBodyRef}
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    rows={10}
                    placeholder="Olá {{guest_name}}, ..."
                    className="font-mono text-sm resize-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={templateIsDefault} onCheckedChange={setTemplateIsDefault} />
                  <Label>Usar como template padrão</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Se marcado, este template será usado quando nenhum template for selecionado na configuração.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveTemplate}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A configuração de cobrança que usar este template passará a usar o padrão do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTemplateId && deleteTemplate(deleteTemplateId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}

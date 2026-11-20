export type DealRow = {
  id: string;
  status: string;
  source: string | null;
  amount: number | string;
  reservation_id: string | null;
  converted_at: Date | string | null;
  created_at: Date | string;
  lost_reason: string | null;
};

export type ContactRow = {
  id: string;
  source: string | null;
  classification: string | null;
  created_at: Date | string;
  tags?: unknown;
};

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  channel: string;
  recipient_count?: number;
  sent_count?: number;
};

export type ReportFilters = {
  from?: Date | null;
  to?: Date | null;
  source?: string | null;
};

function inRange(dateLike: Date | string, from?: Date | null, to?: Date | null): boolean {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildCommercialSummary(
  deals: DealRow[],
  contacts: ContactRow[],
  filters: ReportFilters = {},
) {
  const filteredDeals = deals.filter((d) => {
    if (filters.source && String(d.source || "") !== filters.source) return false;
    return inRange(d.created_at, filters.from, filters.to);
  });
  const filteredContacts = contacts.filter((c) => inRange(c.created_at, filters.from, filters.to));

  const open = filteredDeals.filter((d) => d.status === "open");
  const won = filteredDeals.filter((d) => d.status === "won" || !!d.reservation_id);
  const lost = filteredDeals.filter((d) => d.status === "lost");
  const wonAmount = won.reduce((acc, d) => acc + toNum(d.amount), 0);
  const openAmount = open.reduce((acc, d) => acc + toNum(d.amount), 0);
  const conversionRate = filteredDeals.length
    ? Math.round((won.length / filteredDeals.length) * 1000) / 10
    : 0;

  const bySource: Record<string, number> = {};
  for (const d of filteredDeals) {
    const key = d.source || "unknown";
    bySource[key] = (bySource[key] || 0) + 1;
  }

  const lostReasons: Record<string, number> = {};
  for (const d of lost) {
    const key = d.lost_reason?.trim() || "sem_motivo";
    lostReasons[key] = (lostReasons[key] || 0) + 1;
  }

  const vip = contacts.filter((c) => {
    const tags = Array.isArray(c.tags) ? c.tags.map(String) : [];
    return c.classification === "vip" || tags.includes("vip");
  }).length;

  return {
    contactsTotal: contacts.length,
    contactsNew: filteredContacts.length,
    leadsTotal: filteredDeals.length,
    opportunitiesOpen: open.length,
    opportunitiesWon: won.length,
    opportunitiesLost: lost.length,
    conversionRate,
    pipelineAmount: openAmount,
    wonAmount,
    averageWonTicket: won.length ? wonAmount / won.length : 0,
    bySource,
    lostReasons,
    vipContacts: vip,
  };
}

export function buildLeadsBySourceCsv(deals: DealRow[]): string {
  const counts: Record<string, { total: number; won: number; lost: number; amount: number }> = {};
  for (const d of deals) {
    const key = d.source || "unknown";
    if (!counts[key]) counts[key] = { total: 0, won: 0, lost: 0, amount: 0 };
    counts[key].total += 1;
    if (d.status === "won" || d.reservation_id) {
      counts[key].won += 1;
      counts[key].amount += toNum(d.amount);
    }
    if (d.status === "lost") counts[key].lost += 1;
  }
  const lines = ["source,total,won,lost,won_amount"];
  for (const [source, row] of Object.entries(counts).sort((a, b) => b[1].total - a[1].total)) {
    lines.push(`${csvEscape(source)},${row.total},${row.won},${row.lost},${row.amount.toFixed(2)}`);
  }
  return lines.join("\n");
}

export function buildCampaignPerformanceCsv(campaigns: CampaignRow[]): string {
  const lines = ["campaign,channel,status,recipients,sent"];
  for (const c of campaigns) {
    lines.push(
      `${csvEscape(c.name)},${csvEscape(c.channel)},${csvEscape(c.status)},${c.recipient_count ?? 0},${c.sent_count ?? 0}`,
    );
  }
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

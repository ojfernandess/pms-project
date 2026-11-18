/** Helpers OTA 2013A compartilhados entre Bukly sync (push) e reservas (pull). */

export const BUKLY_OTA_NS = "http://www.opentravel.org/OTA/2003/05";

export function escapeXml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function normalizeCode(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function basicAuthHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

export function requestorId(): string {
  const fromEnv = (process.env.BUKLY_REQUESTOR_ID ?? "").trim();
  return fromEnv || "STAYOS";
}

export function xmlHasSuccess(body: string): boolean {
  return /<\s*Success\s*\/?\s*>/i.test(body);
}

export function extractOtaErrors(body: string): string[] {
  const out: string[] = [];
  const re = /<Error\b[^>]*>([\s\S]*?)<\/Error>|<Error\b[^>]*\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const text = (match[1] || match[0] || "").replace(/<[^>]+>/g, "").trim();
    if (text) out.push(text.slice(0, 400));
  }
  return out.slice(0, 8);
}

export async function postOtaXml(
  apiUrl: string,
  auth: string,
  xml: string,
): Promise<{ ok: boolean; status: number; body: string; errors: string[] }> {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/xml; charset=utf-8",
      Accept: "application/xml, text/xml, */*",
    },
    body: xml,
  });
  const body = await res.text();
  const ok = res.ok && xmlHasSuccess(body);
  const parsedErrors = extractOtaErrors(body);
  return {
    ok,
    status: res.status,
    body: body.slice(0, 8000),
    errors: ok ? [] : parsedErrors.length ? parsedErrors : [`HTTP ${res.status}: ${body.slice(0, 300) || res.statusText}`],
  };
}

export function readXmlAttr(fragment: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = fragment.match(re);
  return m?.[1]?.trim() || null;
}

/** Blocos `<Tag>...</Tag>` no primeiro nível encontrado (não aninhado robusto). */
export function collectXmlBlocks(xml: string, localName: string): string[] {
  const out: string[] = [];
  const openRe = new RegExp(`<${localName}\\b`, "gi");
  let searchFrom = 0;
  while (searchFrom < xml.length) {
    const slice = xml.slice(searchFrom);
    const openMatch = openRe.exec(slice);
    if (!openMatch || openMatch.index === undefined) break;
    const start = searchFrom + openMatch.index;
    const closeTag = `</${localName}>`;
    const closeIdx = xml.indexOf(closeTag, start);
    if (closeIdx < 0) break;
    const end = closeIdx + closeTag.length;
    out.push(xml.slice(start, end));
    searchFrom = end;
  }
  return out;
}

export function firstTagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").trim() || null;
}

export function buildReadUndeliveredXml(hotelCode: string, reqId: string): string {
  const ts = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_ReadRQ xmlns="${BUKLY_OTA_NS}" Version="1.0" TimeStamp="${escapeXml(ts)}">
  <POS>
    <Source>
      <RequestorID Type="22" ID="${escapeXml(reqId)}"/>
    </Source>
  </POS>
  <ReadRequests>
    <HotelReadRequest HotelCode="${escapeXml(hotelCode)}">
      <SelectionCriteria SelectionType="Undelivered"/>
    </HotelReadRequest>
  </ReadRequests>
</OTA_ReadRQ>`;
}

export type BuklyNotifConfirm = {
  resStatus: "Book" | "Modify" | "Cancel";
  messageId: string;
  reservationId: string;
  pmsReservationCode?: string | null;
  createDateTime?: string | null;
  lastModifyDateTime?: string | null;
};

export function buildNotifReportXml(confirms: BuklyNotifConfirm[]): string {
  const ts = new Date().toISOString();
  const parts = confirms
    .map((c) => {
      const createAttr =
        c.resStatus === "Book" && c.createDateTime ? ` CreateDateTime="${escapeXml(c.createDateTime)}"` : "";
      const modifyAttr =
        (c.resStatus === "Modify" || c.resStatus === "Cancel") && c.lastModifyDateTime
          ? ` LastModifyDateTime="${escapeXml(c.lastModifyDateTime)}"`
          : "";
      const pmsCode = c.pmsReservationCode?.trim();
      const hotelResIds = pmsCode
        ? `<HotelReservationIDs><HotelReservationID ResID_Type="14" ResID_Value="${escapeXml(pmsCode)}"/></HotelReservationIDs>`
        : "";
      return `<HotelReservation ResStatus="${escapeXml(c.resStatus)}"${createAttr}${modifyAttr}>
          <UniqueID Type="16" ID="${escapeXml(c.messageId)}" ID_Context="MessageID"/>
          <ResGlobalInfo>
            ${hotelResIds}
            <BasicPropertyInfo/>
          </ResGlobalInfo>
        </HotelReservation>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_NotifReportRQ xmlns="${BUKLY_OTA_NS}" Version="1.0" TimeStamp="${escapeXml(ts)}">
  <Success/>
  <NotifDetails>
    <HotelNotifReport>
      <HotelReservations>
${parts}
      </HotelReservations>
    </HotelNotifReport>
  </NotifDetails>
</OTA_NotifReportRQ>`;
}
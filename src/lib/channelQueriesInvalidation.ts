/** Evento global para atualizar listas de canais após sincronização em background. */
export const CHANNEL_QUERIES_INVALIDATE_EVENT = "pms:invalidate-channel-queries";

export function dispatchInvalidateChannelQueries(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANNEL_QUERIES_INVALIDATE_EVENT));
}

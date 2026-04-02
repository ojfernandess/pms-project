import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CHANNEL_QUERIES_INVALIDATE_EVENT } from "@/lib/channelQueriesInvalidation";

/** Escuta sincronizações automáticas (tarifário) e atualiza caches React Query. */
export function ChannelQueriesInvalidationListener() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const fn = () => {
      void queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      void queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
    };
    window.addEventListener(CHANNEL_QUERIES_INVALIDATE_EVENT, fn);
    return () => window.removeEventListener(CHANNEL_QUERIES_INVALIDATE_EVENT, fn);
  }, [queryClient]);
  return null;
}

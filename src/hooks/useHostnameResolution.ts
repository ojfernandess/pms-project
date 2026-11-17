import { useQuery } from "@tanstack/react-query";
import type { HostnameResolution } from "@/types/hostnameResolution";
import { resolvePmsApiUrl } from "@/lib/runtimeConfig";

async function fetchHostnameResolution(): Promise<HostnameResolution> {
  const base = resolvePmsApiUrl().replace(/\/$/, "");
  const visitorHost =
    typeof window !== "undefined"
      ? window.location.hostname.toLowerCase().replace(/^www\./, "")
      : "";
  const url = `${base}/functions/v1/resolve-hostname?hostname=${encodeURIComponent(visitorHost)}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "omit",
    headers: {
      Accept: "application/json",
      "X-PMS-Visitor-Host": visitorHost,
    },
  });
  if (!response.ok) {
    throw new Error(`resolve-hostname: ${response.status}`);
  }
  return (await response.json()) as HostnameResolution;
}

export function useHostnameResolution() {
  const hostname =
    typeof window !== "undefined"
      ? window.location.hostname.toLowerCase().replace(/^www\./, "")
      : "";

  const query = useQuery({
    queryKey: ["hostname-resolution", hostname],
    queryFn: fetchHostnameResolution,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    resolution: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
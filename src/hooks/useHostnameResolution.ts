import { useQuery } from "@tanstack/react-query";
import type { HostnameResolution } from "@/types/hostnameResolution";

/** Chama a API na mesma origem do visitante para o Host correto (checkin vs pms). */
function resolutionApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/$/, "");
}

async function fetchHostnameResolution(): Promise<HostnameResolution> {
  const base = resolutionApiBase();
  const response = await fetch(`${base}/functions/v1/resolve-hostname`, {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" },
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
import { useQuery } from "@tanstack/react-query";

const IBGE_MUNICIPIOS_URL =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome";

type IbgeMunicipio = { nome?: string };

async function fetchIbgeMunicipios(): Promise<string[]> {
  const res = await fetch(IBGE_MUNICIPIOS_URL);
  if (!res.ok) throw new Error("Não foi possível carregar municípios IBGE");
  const data = (await res.json()) as IbgeMunicipio[];
  const names = new Set<string>();
  for (const m of data) {
    const nome = (m.nome || "").trim();
    if (nome) names.add(nome.toUpperCase());
  }
  return Array.from(names);
}

/** Municípios brasileiros (IBGE), em cache no React Query. */
export function useIbgeMunicipios(enabled = true) {
  return useQuery({
    queryKey: ["ibge_municipios_fnrh"],
    queryFn: fetchIbgeMunicipios,
    enabled,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
  });
}

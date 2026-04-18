/** Valores dos domínios FNRH v2 (documentação oficial) — para selects na UI. */

/** Valor sentinela no Select até o hóspede escolher (obrigatório no web check-in). */
export const FNRH_SELECT_PLACEHOLDER = "__fnrh_unset__";

export const FNRH_GENEROS = [
  { id: "HOMEM", label: "Masculino" },
  { id: "MULHER", label: "Feminino" },
  { id: "OUTRO", label: "Outros" },
  { id: "NAOINFORMADO", label: "Prefiro não informar" },
] as const;

export const FNRH_MOTIVOS_VIAGEM = [
  { id: "COMPRAS", label: "Compras" },
  { id: "CONGRESSO_FEIRA", label: "Congresso/Feira" },
  { id: "ESTUDOS_CURSOS", label: "Estudos/Cursos" },
  { id: "LAZER_FERIAS", label: "Lazer/Férias" },
  { id: "NEGOCIOS", label: "Negócios" },
  { id: "PARENTES_AMIGOS", label: "Parentes/Amigos" },
  { id: "RELIGIAO", label: "Religião" },
  { id: "SAUDE", label: "Saúde" },
] as const;

export const FNRH_MEIOS_TRANSPORTE = [
  { id: "ONIBUS", label: "Ônibus" },
  { id: "AUTOMOVEL", label: "Automóvel" },
  { id: "AVIAO", label: "Avião" },
  { id: "MOTO", label: "Moto" },
  { id: "NAVIO_BARCO", label: "Navio/Barco" },
  { id: "PE", label: "A pé" },
  { id: "TREM", label: "Trem" },
  { id: "BICICLETA", label: "Bicicleta" },
] as const;

export const FNRH_RACAS = [
  { id: "AMARELA", label: "Amarelo" },
  { id: "BRANCA", label: "Branco" },
  { id: "INDIGENA", label: "Indígena" },
  { id: "PARDA", label: "Pardo" },
  { id: "PRETA", label: "Preto" },
  { id: "NAOINFORMAR", label: "Prefiro não informar" },
] as const;

export const FNRH_DEFICIENCIA = [
  { id: "SIM", label: "Sim" },
  { id: "NAO", label: "Não" },
  { id: "NAOINFORMAR", label: "Prefiro não informar" },
] as const;

/** GET /dominios/pessoas/tipos_deficiencia — obrigatório quando deficiencia_id = SIM */
export const FNRH_TIPOS_DEFICIENCIA = [
  { id: "FISICA", label: "Deficiência física" },
  { id: "AUDITIVA_SURDEZ", label: "Deficiência auditiva/surdez" },
  { id: "VISUAL", label: "Deficiência visual" },
  { id: "INTELECTUAL", label: "Deficiência intelectual" },
  { id: "MULTIPLA", label: "Deficiência múltipla" },
] as const;

export const FNRH_SITUACOES_HOSPEDE = [
  { id: "PRECHECKIN_PENDENTE", label: "Pré-check-in pendente" },
  { id: "CHECKIN_REALIZADO", label: "Check-in realizado" },
  { id: "PRECHECKIN_REALIZADO", label: "Pré-check-in realizado" },
] as const;

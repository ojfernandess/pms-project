import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCompanyPublicApiPostmanCollectionV21,
  downloadJsonFile,
  type CompanyPublicApiPostmanEndpoint,
} from "@/lib/companyPublicApiPostmanCollection";
import { Copy, FileDown, KeyRound, Loader2, Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Props = {
  companyId: string | null | undefined;
  supabaseProjectUrl: string | null;
  isFeatureEnabled: boolean;
};

type CredentialStatus = {
  company_id: string;
  client_id: string;
  is_active: boolean;
  last_used_at: string | null;
  updated_at: string | null;
};

type EndpointDoc = {
  title: string;
  description: string;
  method: "GET" | "POST";
  url: string;
  acceptedParams: string[];
  acceptedParamSections?: { title: string; items: string[] }[];
  payloadExample?: string;
  responseExample: string;
};

export function CompanyApiCredentialsCard({ companyId, supabaseProjectUrl, isFeatureEnabled }: Props) {
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);
  const [persistedSecret, setPersistedSecret] = useState<string | null>(null);

  const secretStorageKey = useMemo(() => {
    if (!companyId) return null;
    return `company_api_secret:${companyId}`;
  }, [companyId]);

  const endpointBase = useMemo(() => {
    const base = (supabaseProjectUrl || "").trim().replace(/\/$/, "");
    if (!base) return "";
    return `${base}/functions/v1/company-public-api`;
  }, [supabaseProjectUrl]);

  const endpointDocs = useMemo<EndpointDoc[]>(() => {
    if (!endpointBase) return [];
    return [
      {
        title: "Criar Reserva",
        description:
          "Cria uma reserva no PMS com os dados da hospedagem, hóspede principal e unidades de quarto.",
        method: "POST",
        url: `${endpointBase}?action=create-reservation`,
        acceptedParams: [
          "arrival_date (string, obrigatório): Data de check-in (YYYY-MM-DD).",
          "departure_date (string, obrigatório): Data de check-out (YYYY-MM-DD).",
          "rateplan_id (number, obrigatório): ID do plano tarifário.",
          "comment (string, opcional): Observações da reserva.",
          "guest.first_name (string, obrigatório): Nome do hóspede principal.",
          "guest.last_name (string, opcional): Sobrenome do hóspede principal.",
          "guest.document_type (string, opcional): cpf, rg ou passport.",
          "guest.document (string, opcional): Documento do hóspede.",
          "guest.phone (string, obrigatório): Telefone do hóspede.",
          "guest.email (string, opcional): E-mail do hóspede.",
          "room_units (array, obrigatório): Lista de unidades.",
        ],
        payloadExample: `{
  "arrival_date": "2026-04-10",
  "departure_date": "2026-04-12",
  "rateplan_id": 12,
  "comment": "Reserva via API pública",
  "guest": {
    "first_name": "Maria",
    "last_name": "Silva",
    "document_type": "cpf",
    "document": "12345678909",
    "phone": "+55 11 99999-9999",
    "email": "maria@email.com"
  },
  "room_units": [
    { "price": 650, "adults": 2, "kids": 1, "ages": [8] }
  ]
}`,
        responseExample: `{
  "success": true,
  "action": "create-reservation",
  "reservation_id": "123456",
  "message": "Reserva criada com sucesso."
}`,
      },
      {
        title: "Listar Reservas",
        description:
          "Retorna uma lista paginada de reservas com filtros por datas, status e hóspede.",
        method: "GET",
        url: `${endpointBase}?action=list-reservations`,
        acceptedParams: [
          "booking_id (number, opcional): ID da reserva.",
          "status (number, opcional): Status da reserva.",
          "per_page (number, opcional): Itens por página (20, 50, 100, 200, 500).",
          "page (number, opcional): Página atual.",
          "checkin (date, opcional): Filtra por data de check-in.",
          "checkout (date, opcional): Filtra por data de check-out.",
          "created (date, opcional): Filtra por data de criação.",
          "period_one (date, opcional): Início do período.",
          "period_two (date, opcional): Fim do período.",
          "guest (number, opcional): ID do hóspede.",
        ],
        responseExample: `{
  "success": true,
  "action": "list-reservations",
  "current_page": 1,
  "total_pages": 3,
  "total_bookings": 58,
  "bookings": [
    { "booking_id": 111111, "status": 2, "checkin": "2026-04-10" }
  ]
}`,
      },
      {
        title: "Retornar Reserva por ID",
        description:
          "Retorna o detalhamento completo de uma reserva. Em GET, informe `booking_id` na query (UUID da reserva ou `reservation_code`). Opcionalmente pode-se usar POST com o mesmo campo no corpo JSON.",
        method: "GET",
        url: `${endpointBase}?action=get-reservation-by-id&booking_id={id}`,
        acceptedParams: [],
        acceptedParamSections: [
          {
            title: "Parâmetros de consulta (URL)",
            items: [
              "booking_id (string, obrigatório): UUID da reserva (`reservations.id`) ou código único (`reservation_code`).",
            ],
          },
        ],
        payloadExample: `{
  "booking_id": "550e8400-e29b-41d4-a716-446655440000"
}`,
        responseExample: `{
  "success": true,
  "action": "get-reservation-by-id",
  "booking": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "reservation_code": "RES-2026-001",
    "establishment_id": "660e8400-e29b-41d4-a716-446655440001",
    "checkin_date": "2026-04-10",
    "checkout_date": "2026-04-12",
    "adults": 2,
    "children": 1,
    "status": "confirmed",
    "payment_status": "partial",
    "channel": "direct",
    "total_amount": 1200.0,
    "paid_amount": 400.0,
    "balance_due": 800.0,
    "notes": "Check-in após 22h",
    "pricing_plan": {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "Tarifa flexível"
    },
    "category": {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "name": "Suíte Deluxe"
    },
    "room": {
      "id": "990e8400-e29b-41d4-a716-446655440004",
      "room_number": "201",
      "floor": 2,
      "status": "available"
    },
    "financial_responsible": {
      "id": "aa0e8400-e29b-41d4-a716-446655440005",
      "full_name": "João Pagador",
      "email": "joao@email.com",
      "phone": "+55 11 98888-7777",
      "document_type": "cpf",
      "document_number": "98765432100"
    },
    "guest": {
      "id": "bb0e8400-e29b-41d4-a716-446655440006",
      "full_name": "Maria Silva",
      "email": "maria@email.com",
      "phone": "+55 11 99999-9999",
      "document_type": "cpf",
      "document_number": "12345678909"
    },
    "service_fees": [
      {
        "id": "cc0e8400-e29b-41d4-a716-446655440007",
        "name": "Taxa de turismo",
        "amount": 12.5,
        "quantity": 2,
        "notes": "Por adulto / diária"
      }
    ],
    "created_at": "2026-03-01T14:20:00.000Z",
    "updated_at": "2026-04-07T09:15:00.000Z"
  }
}`,
      },
      {
        title: "Listar Estabelecimentos",
        description:
          "Lista os estabelecimentos da empresa. Em cada um, `units` indica se há prédios cadastrados; quando `has_buildings` é true, `buildings` traz cada prédio com `categories` e os `rooms` de cada categoria (unidades).",
        method: "GET",
        url: `${endpointBase}?action=establishments`,
        acceptedParams: [],
        responseExample: `{
  "success": true,
  "action": "establishments",
  "company": { "id": "uuid", "name": "Minha Empresa" },
  "establishments": [
    {
      "id": "uuid",
      "name": "Hotel Centro",
      "is_active": true,
      "units": {
        "has_buildings": true,
        "buildings": [
          {
            "id": "uuid-prédio",
            "name": "Torre A",
            "categories": [
              {
                "id": "uuid-cat",
                "name": "Standard",
                "rooms": [
                  { "id": "uuid-quarto", "room_number": "101", "floor": 1, "status": "available" }
                ]
              }
            ]
          }
        ]
      }
    }
  ]
}`,
      },
      {
        title: "Listar Manutenção",
        description:
          "Lista chamados de manutenção do estabelecimento, com dados do quarto vinculado quando existir.",
        method: "GET",
        url: `${endpointBase}?action=list-maintenance`,
        acceptedParams: [
          "establishment_id (uuid, opcional): Filtro por estabelecimento; se omitido, usa o primeiro ativo da empresa.",
          "status (string, opcional): Filtra por status do chamado (ex.: open, in_progress, completed).",
          "page (number, opcional): Página (padrão 1).",
          "per_page (number, opcional): Itens por página (1–200, padrão 50).",
        ],
        responseExample: `{
  "success": true,
  "action": "list-maintenance",
  "establishment_id": "uuid",
  "current_page": 1,
  "total_tickets": 12,
  "tickets": [
    {
      "id": "uuid",
      "title": "Ar condicionado",
      "status": "open",
      "rooms": { "id": "uuid", "room_number": "201" }
    }
  ]
}`,
      },
      {
        title: "Listar Clientes",
        description: "Lista clientes (cadastro de hóspedes) do estabelecimento, com paginação e busca opcional.",
        method: "GET",
        url: `${endpointBase}?action=list-clients`,
        acceptedParams: [
          "establishment_id (uuid, opcional): Filtro por estabelecimento; se omitido, usa o primeiro ativo da empresa.",
          "search (string, opcional): Busca em nome, e-mail ou telefone.",
          "page (number, opcional): Página (padrão 1).",
          "per_page (number, opcional): Itens por página (1–200, padrão 50).",
        ],
        responseExample: `{
  "success": true,
  "action": "list-clients",
  "establishment_id": "uuid",
  "total_clients": 120,
  "clients": [
    {
      "id": "uuid",
      "full_name": "Maria Silva",
      "email": "maria@email.com",
      "phone": "+55 11 99999-9999"
    }
  ]
}`,
      },
      {
        title: "Mapa de Ocupação",
        description:
          "Retorna o estado dos quartos em uma data (noite): reserva atribuída ao quarto quando a data está entre check-in (inclusivo) e check-out (exclusivo), resumo de totais e identificação de categoria/prédio.",
        method: "GET",
        url: `${endpointBase}?action=occupancy-map&date=2026-04-18`,
        acceptedParams: [
          "establishment_id (uuid, opcional): Estabelecimento; se omitido, usa o primeiro ativo da empresa.",
          "date (string, opcional): Data de referência YYYY-MM-DD (padrão: hoje em UTC).",
        ],
        responseExample: `{
  "success": true,
  "action": "occupancy-map",
  "date": "2026-04-18",
  "summary": { "total_rooms": 40, "occupied_rooms": 28, "available_rooms": 12 },
  "rooms": [
    {
      "room_id": "uuid",
      "room_number": "101",
      "category_name": "Standard",
      "building_name": "Torre A",
      "occupied": true,
      "reservation": {
        "reservation_code": "RES-001",
        "checkin_date": "2026-04-17",
        "checkout_date": "2026-04-20",
        "status": "checkedin",
        "guest_name": "João"
      }
    }
  ]
}`,
      },
      {
        title: "Listar Avaliações da Estadia",
        description:
          "Lista avaliações (`stay_reviews`) do estabelecimento, com resumo da reserva vinculada. Filtros opcionais por publicação e intervalo de datas de envio.",
        method: "GET",
        url: `${endpointBase}?action=list-stay-reviews`,
        acceptedParams: [
          "establishment_id (uuid, opcional): Estabelecimento; se omitido, usa o primeiro ativo da empresa.",
          "is_published (string, opcional): true ou false para filtrar publicadas.",
          "submitted_from / submitted_to (date, opcional): Intervalo em submitted_at (YYYY-MM-DD).",
          "page (number, opcional): Página (padrão 1).",
          "per_page (number, opcional): Itens por página (1–200, padrão 50).",
        ],
        responseExample: `{
  "success": true,
  "action": "list-stay-reviews",
  "establishment_id": "uuid",
  "total_reviews": 24,
  "reviews": [
    {
      "id": "uuid",
      "room_rating": 5,
      "service_rating": 5,
      "comment": "Ótima estadia",
      "submitted_at": "2026-04-10T12:00:00.000Z",
      "reservation": {
        "id": "uuid", "reservation_code": "RES-001",
        "checkin_date": "2026-04-08", "checkout_date": "2026-04-10",
        "guest_name": "Maria",
        "status": "checkedout"
      }
    }
  ]
}`,
      },
      {
        title: "Gerar link de avaliação da estadia",
        description:
          "Monta a URL pública de avaliação no mesmo formato do PMS (`/review/{locator}`), usando `identification_number` da reserva ou, se vazio, `reservation_code`. A URL base vem de `VITE_APP_URL` / `SITE_URL` / `PUBLIC_APP_URL` no ambiente da função, ou do parâmetro `base_url` (ex.: https://app.seudominio.com).",
        method: "GET",
        url: `${endpointBase}?action=stay-review-link&booking_id={id}`,
        acceptedParams: [],
        acceptedParamSections: [
          {
            title: "Query (GET) ou corpo JSON (POST)",
            items: [
              "booking_id (string, obrigatório): UUID da reserva (`reservations.id`) ou `reservation_code`.",
              "base_url (string, opcional): Origem do front (https://…); se omitido, usa variáveis de ambiente da Edge Function.",
            ],
          },
        ],
        payloadExample: `{
  "booking_id": "550e8400-e29b-41d4-a716-446655440000",
  "base_url": "https://app.exemplo.com"
}`,
        responseExample: `{
  "success": true,
  "action": "stay-review-link",
  "establishment_id": "uuid",
  "reservation_id": "uuid",
  "reservation_code": "RES-2026-001",
  "locator": "ABC123",
  "review_url": "https://app.exemplo.com/review/ABC123"
}`,
      },
      {
        title: "Web Check-in",
        description: "Realiza o web check-in de uma reserva existente.",
        method: "POST",
        url: `${endpointBase}?action=web-checkin`,
        acceptedParams: [],
        acceptedParamSections: [
          {
            title: "Dados da Reserva",
            items: [
              "booking_id (number, obrigatório): ID da reserva.",
              "arrival_time (string, opcional): Hora prevista de chegada (HH:mm).",
              "origin_country (string, opcional): País de origem.",
              "transportation_mode (string, opcional): Meio de transporte de chegada.",
              "notes (string, opcional): Observações adicionais do check-in.",
            ],
          },
          {
            title: "Veículo",
            items: [
              "vehicle.plate (string, opcional): Placa do veículo.",
              "vehicle.model (string, opcional): Modelo do veículo.",
              "vehicle.color (string, opcional): Cor do veículo.",
            ],
          },
          {
            title: "Hóspede Principal",
            items: [
              "main_guest.first_name (string, obrigatório): Nome do hóspede principal.",
              "main_guest.last_name (string, obrigatório): Sobrenome do hóspede principal.",
              "main_guest.birth_date (string, obrigatório): Data de nascimento (YYYY-MM-DD).",
              "main_guest.document_type (string, obrigatório): cpf, rg, passport ou cnh.",
              "main_guest.document_number (string, obrigatório): Número do documento.",
              "main_guest.document_issuer (string, opcional): Órgão emissor.",
              "main_guest.document_issue_date (string, opcional): Data de emissão (YYYY-MM-DD).",
              "main_guest.gender (string, opcional): male, female, other.",
              "main_guest.nationality (string, opcional): Nacionalidade.",
              "main_guest.phone (string, obrigatório): Telefone de contato.",
              "main_guest.email (string, opcional): E-mail do hóspede.",
              "main_guest.profession (string, opcional): Profissão.",
              "main_guest.marital_status (string, opcional): Estado civil.",
            ],
          },
          {
            title: "Endereço do Hóspede Principal",
            items: [
              "main_guest.address.zip_code (string, obrigatório): CEP.",
              "main_guest.address.street (string, obrigatório): Logradouro.",
              "main_guest.address.number (string, obrigatório): Número.",
              "main_guest.address.complement (string, opcional): Complemento.",
              "main_guest.address.neighborhood (string, obrigatório): Bairro.",
              "main_guest.address.city (string, obrigatório): Cidade.",
              "main_guest.address.state (string, obrigatório): Estado/UF.",
              "main_guest.address.country (string, obrigatório): País.",
            ],
          },
          {
            title: "Acompanhantes",
            items: [
              "companions (array, opcional): Lista de acompanhantes da reserva.",
              "companions[].first_name (string, obrigatório): Nome do acompanhante.",
              "companions[].last_name (string, obrigatório): Sobrenome do acompanhante.",
              "companions[].birth_date (string, obrigatório): Data de nascimento.",
              "companions[].document_type (string, opcional): Tipo do documento.",
              "companions[].document_number (string, opcional): Número do documento.",
              "companions[].is_child (boolean, opcional): Se é menor de idade.",
              "companions[].guardian_name (string, opcional): Responsável legal (quando menor).",
            ],
          },
          {
            title: "Assinatura e Consentimentos",
            items: [
              "signature.base64 (string, obrigatório): Assinatura digital em base64.",
              "signature.signed_at (string, opcional): Data/hora da assinatura.",
              "consents.accept_terms (boolean, obrigatório): Aceite de termos de hospedagem.",
              "consents.accept_privacy (boolean, obrigatório): Aceite da política de privacidade.",
              "consents.accept_marketing (boolean, opcional): Aceite de comunicações comerciais.",
            ],
          },
          {
            title: "Anexos",
            items: [
              "attachments (array, opcional): Documentos/imagens em base64.",
              "attachments[].type (string, obrigatório): Ex. document_front, document_back, selfie.",
              "attachments[].file_name (string, opcional): Nome do arquivo.",
              "attachments[].content_base64 (string, obrigatório): Conteúdo do arquivo.",
            ],
          },
        ],
        payloadExample: `{
  "booking_id": 111111,
  "arrival_time": "15:30",
  "origin_country": "Brasil",
  "transportation_mode": "car",
  "vehicle": {
    "plate": "ABC1D23",
    "model": "Corolla",
    "color": "Prata"
  },
  "main_guest": {
    "first_name": "Maria",
    "last_name": "Silva",
    "birth_date": "1990-04-02",
    "document_type": "cpf",
    "document_number": "12345678909",
    "document_issuer": "SSP",
    "document_issue_date": "2018-01-01",
    "gender": "female",
    "nationality": "Brasileira",
    "phone": "+55 11 99999-9999",
    "email": "maria@email.com",
    "profession": "Administradora",
    "marital_status": "single",
    "address": {
      "zip_code": "01310100",
      "street": "Av. Paulista",
      "number": "1000",
      "complement": "Apto 91",
      "neighborhood": "Bela Vista",
      "city": "Sao Paulo",
      "state": "SP",
      "country": "Brasil"
    }
  },
  "companions": [
    {
      "first_name": "Joao",
      "last_name": "Silva",
      "birth_date": "2015-10-10",
      "document_type": "rg",
      "document_number": "1234567",
      "is_child": true,
      "guardian_name": "Maria Silva"
    }
  ],
  "signature": {
    "base64": "base64-signature",
    "signed_at": "2026-04-07T20:30:00Z"
  },
  "consents": {
    "accept_terms": true,
    "accept_privacy": true,
    "accept_marketing": false
  },
  "attachments": [
    {
      "type": "document_front",
      "file_name": "doc-frente.jpg",
      "content_base64": "base64-content"
    },
    {
      "type": "selfie",
      "file_name": "selfie.jpg",
      "content_base64": "base64-content"
    }
  ],
  "notes": "Chegada apos as 22h."
}`,
        responseExample: `{
  "success": true,
  "action": "web-checkin",
  "booking_id": 111111,
  "checkin_status": "completed",
  "message": "Web check-in realizado."
}`,
      },
      {
        title: "Verificar Suíte Limpa/Suja",
        description: "Consulta o estado de limpeza da suíte/quarto para operação de check-in.",
        method: "GET",
        url: `${endpointBase}?action=room-clean-status&room_id={id}`,
        acceptedParams: ["room_id (number, obrigatório): ID do quarto/suíte."],
        responseExample: `{
  "success": true,
  "action": "room-clean-status",
  "room_id": 404,
  "clean_status": "clean"
}`,
      },
    ];
  }, [endpointBase]);

  const postmanEndpoints = useMemo<CompanyPublicApiPostmanEndpoint[]>(() => {
    const fromDocs = endpointDocs.map((d) => ({
      title: d.title,
      description: d.description,
      method: d.method,
      fullUrl: d.url,
      payloadExample: d.method === "POST" ? d.payloadExample : undefined,
    }));
    const getById = endpointDocs.find((d) => d.title === "Retornar Reserva por ID");
    if (getById?.payloadExample?.trim() && endpointBase) {
      fromDocs.push({
        title: "Retornar Reserva por ID (POST, corpo JSON)",
        description:
          "Alternativa ao GET: envia `booking_id` no corpo JSON com a mesma action (quando o gateway aceitar corpo em POST).",
        method: "POST",
        fullUrl: `${endpointBase}?action=get-reservation-by-id`,
        payloadExample: getById.payloadExample,
      });
    }
    if (endpointBase) {
      fromDocs.push({
        title: "Mapa de Ocupação (POST, corpo JSON)",
        description:
          "Alternativa ao GET: envia `establishment_id` e `date` (YYYY-MM-DD) no corpo JSON; `date` opcional (padrão UTC hoje).",
        method: "POST",
        fullUrl: `${endpointBase}?action=occupancy-map`,
        payloadExample: `{
  "establishment_id": "660e8400-e29b-41d4-a716-446655440001",
  "date": "2026-04-18"
}`,
      });
      const stayReviewDoc = endpointDocs.find((d) => d.title === "Gerar link de avaliação da estadia");
      if (stayReviewDoc?.payloadExample?.trim()) {
        fromDocs.push({
          title: "Gerar link de avaliação (POST, corpo JSON)",
          description:
            "Alternativa ao GET: envia `booking_id` e opcionalmente `base_url` no corpo JSON com a mesma action.",
          method: "POST",
          fullUrl: `${endpointBase}?action=stay-review-link`,
          payloadExample: stayReviewDoc.payloadExample.trim(),
        });
      }
    }
    return fromDocs;
  }, [endpointDocs, endpointBase]);

  const handleDownloadPostmanCollection = () => {
    if (!endpointBase) return;
    try {
      const collection = buildCompanyPublicApiPostmanCollectionV21(endpointBase, postmanEndpoints, {
        clientId: status?.client_id ?? "",
        clientSecret: newSecret ?? persistedSecret ?? "",
      });
      downloadJsonFile(collection, "company-public-api.postman_collection.json");
      toast.success("Coleção Postman baixada. No Postman: Import → selecione o arquivo JSON.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar a coleção Postman.");
    }
  };

  const curlExample = useMemo(() => {
    if (!endpointBase || !status?.client_id || !newSecret) return "";
    return `curl -X GET "${endpointBase}?action=establishments" \\
  -H "ClientId: ${status.client_id}" \\
  -H "ClientSecret: ${newSecret}"`;
  }, [endpointBase, status?.client_id, newSecret, persistedSecret]);

  const loadStatus = async (targetCompanyId: string) => {
    setLoadingStatus(true);
    try {
      const { data, error } = await supabase.rpc("get_company_api_credentials_status", {
        p_company_id: targetCompanyId,
      } as never);
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as CredentialStatus | undefined) : null;
      setStatus(row ?? null);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar credenciais da empresa.");
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (!companyId || !isFeatureEnabled) return;
    void loadStatus(companyId);
  }, [companyId, isFeatureEnabled]);

  useEffect(() => {
    if (!secretStorageKey) {
      setPersistedSecret(null);
      return;
    }
    try {
      const stored = localStorage.getItem(secretStorageKey);
      setPersistedSecret(stored || null);
    } catch {
      setPersistedSecret(null);
    }
  }, [secretStorageKey]);

  const handleRotate = async () => {
    if (!companyId) return;
    setRotating(true);
    try {
      const { data, error } = await supabase.rpc("rotate_company_api_credentials", {
        p_company_id: companyId,
      } as never);
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as { client_id: string; client_secret: string } | undefined) : null;
      if (!row?.client_id || !row?.client_secret) {
        throw new Error("Resposta inválida ao gerar credenciais.");
      }
      setNewSecret(row.client_secret);
      setPersistedSecret(row.client_secret);
      if (secretStorageKey) {
        try {
          localStorage.setItem(secretStorageKey, row.client_secret);
        } catch {
          // ignore storage failures
        }
      }
      await loadStatus(companyId);
      toast.success("Credenciais geradas/rotacionadas com sucesso.");
    } catch (err: unknown) {
      console.error(err);
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "";
      toast.error(msg || "Erro ao rotacionar credenciais.");
    } finally {
      setRotating(false);
    }
  };

  const handleSetActive = async (active: boolean) => {
    if (!companyId) return;
    setTogglingActive(true);
    try {
      const { error } = await supabase.rpc("set_company_api_credentials_active", {
        p_company_id: companyId,
        p_is_active: active,
      } as never);
      if (error) throw error;
      toast.success(active ? "API reativada." : "API desativada.");
      await loadStatus(companyId);
    } catch (err: unknown) {
      console.error(err);
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "";
      toast.error(msg || "Erro ao alterar estado da API.");
    } finally {
      setTogglingActive(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  };

  if (!companyId) return null;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            API da Empresa (Client Credentials)
          </h4>
          <p className="text-sm text-muted-foreground">
            Um `client_id` e `client_secret` por empresa com acesso aos estabelecimentos vinculados.
          </p>
        </div>
        {!status?.client_id ? (
          <Badge variant="secondary">Sem credencial</Badge>
        ) : status.is_active ? (
          <Badge>Ativo</Badge>
        ) : (
          <Badge variant="destructive">Desativado</Badge>
        )}
      </div>

      {!isFeatureEnabled ? (
        <div className="text-sm text-muted-foreground">
          Feature `api_integrations` desativada para esta empresa.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input value={status?.client_id || ""} readOnly placeholder="Gere as credenciais para exibir o Client ID" />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                disabled={!status?.client_id}
                onClick={() => status?.client_id && copyText(status.client_id, "Client ID")}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar ID
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <Input
                value={newSecret || persistedSecret || ""}
                readOnly
                className="font-mono text-xs"
                placeholder="Gere/rotacione para visualizar o client_secret"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                disabled={!newSecret && !persistedSecret}
                onClick={() => (newSecret || persistedSecret) && copyText(newSecret || persistedSecret || "", "Client Secret")}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar Secret
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleRotate} disabled={rotating || togglingActive}>
              {rotating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {status?.client_id ? "Rotacionar credenciais" : "Gerar credenciais"}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loadingStatus || togglingActive}
              onClick={() => companyId && void loadStatus(companyId)}
            >
              {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar status"}
            </Button>
            {status?.client_id && status.is_active && (
              <Button
                type="button"
                variant="outline"
                disabled={togglingActive || rotating}
                onClick={() => void handleSetActive(false)}
              >
                {togglingActive ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Power className="h-4 w-4 mr-2" />
                )}
                Desativar API
              </Button>
            )}
            {status?.client_id && !status.is_active && (
              <Button type="button" disabled={togglingActive || rotating} onClick={() => void handleSetActive(true)}>
                {togglingActive ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Power className="h-4 w-4 mr-2" />
                )}
                Reativar API
              </Button>
            )}
          </div>

          {endpointBase && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/40">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Endpoints da API pública</p>
                  <p className="text-xs text-muted-foreground">
                    Baixe a coleção Postman (v2.1) e importe em Postman → Import → arquivo JSON. Preencha as variáveis
                    `clientId`, `clientSecret`, `bookingId` e `roomId` na coleção.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleDownloadPostmanCollection}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Coleção Postman
                </Button>
              </div>

              <Accordion type="multiple" className="w-full space-y-3">
                {endpointDocs.map((item) => (
                  <AccordionItem key={item.url} value={item.url} className="rounded-md border bg-background px-3">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex items-center justify-between gap-2 w-full pr-2">
                        <p className="text-sm font-semibold text-left">{item.title}</p>
                        <Badge variant={item.method === "GET" ? "secondary" : "default"}>{item.method}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-3">
                      <p className="text-xs text-muted-foreground">{item.description}</p>

                      <div className="space-y-1 pt-1">
                        <p className="text-xs font-medium">HTTP Request</p>
                        <code className="text-xs break-all block rounded bg-muted px-2 py-1">{item.url}</code>
                      </div>

                      <div className="space-y-1 pt-1">
                        <p className="text-xs font-medium">Parâmetros Aceitos</p>
                        {item.acceptedParamSections && item.acceptedParamSections.length > 0 ? (
                          <div className="space-y-2">
                            {item.acceptedParamSections.map((section) => (
                              <div key={`${item.title}-${section.title}`} className="space-y-1">
                                <p className="text-xs font-semibold">{section.title}</p>
                                <ul className="list-disc pl-5 space-y-1">
                                  {section.items.map((p) => (
                                    <li key={p} className="text-xs">
                                      {p}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ) : item.acceptedParams.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem parâmetros adicionais.</p>
                        ) : (
                          <ul className="list-disc pl-5 space-y-1">
                            {item.acceptedParams.map((p) => (
                              <li key={p} className="text-xs">
                                {p}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {item.payloadExample && (
                        <div className="space-y-1 pt-1">
                          <p className="text-xs font-medium">Payload (exemplo)</p>
                          <pre className="text-xs whitespace-pre-wrap rounded bg-muted px-2 py-1">{item.payloadExample}</pre>
                        </div>
                      )}

                      <div className="space-y-1 pt-1">
                        <p className="text-xs font-medium">Resposta 200 (exemplo)</p>
                        <pre className="text-xs whitespace-pre-wrap rounded bg-muted px-2 py-1">{item.responseExample}</pre>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {curlExample && (
                <>
                  <p className="text-xs text-muted-foreground pt-1">Exemplo de autenticação</p>
                  <pre className="text-xs whitespace-pre-wrap">{curlExample}</pre>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}


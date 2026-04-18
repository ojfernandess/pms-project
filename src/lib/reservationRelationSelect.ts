/**
 * Embeds de reservations sem colunas pesadas (arrays de fotos, features, textos longos).
 * A listagem com `rooms(*)` e `room_categories(*)` gerava respostas de vários MB e
 * ~15–20s por pedido, levando a timeouts e 500 no PostgREST / edge.
 *
 * Mantém campos usados no PMS (nome do quarto, senha Wi‑Fi, capacidades, building_id, etc.).
 */
export const RESERVATION_ROOMS_EMBED_COLUMNS =
  "id, name, room_number, floor, status, category_id, establishment_id, is_blocked, hide_from_map, show_in_public, maintenance_fee, commission, notes, owner_user_id, owner_for_receipt_id, exclude_from_billing, authentication_type, fixed_password, created_at, updated_at";

export const RESERVATION_ROOM_CATEGORIES_EMBED_COLUMNS =
  "id, name, slug, type, color, day_use, privacy, bed_type, size_sqm, base_price, created_at, updated_at, building_id, abbreviation, courtesy_age, display_order, courtesy_limit, show_in_public, capacity_adults, capacity_children, minimum_occupancy, maximum_occupancy, standard_occupancy, accommodation_quantity, highlight_badge, establishment_id, amenities, display_description";

/** Mesmo embed de categoria sem textos/listas grandes — para listagem/refetch em massa (evita timeout 500 no PostgREST). */
export const RESERVATION_ROOM_CATEGORIES_LIST_EMBED_COLUMNS =
  "id, name, slug, type, color, day_use, privacy, bed_type, size_sqm, base_price, created_at, updated_at, building_id, abbreviation, courtesy_age, display_order, courtesy_limit, show_in_public, capacity_adults, capacity_children, minimum_occupancy, maximum_occupancy, standard_occupancy, accommodation_quantity, highlight_badge, establishment_id";

/** Lista principal (mapa/tabela): use em `useReservations` — mais leve que FULL. */
export const RESERVATION_RELATIONS_LIST_SELECT = `
  *,
  financial_responsible:clients!client_id(*),
  guest:clients!guest_id(*),
  rooms(${RESERVATION_ROOMS_EMBED_COLUMNS}),
  room_categories(${RESERVATION_ROOM_CATEGORIES_LIST_EMBED_COLUMNS}),
  reservation_service_fees(amount, quantity),
  pricing_plans(*)
`;

/** Lista principal + taxas + plano tarifário (substitui rooms(*), room_categories(*), pricing_plans(*)). */
export const RESERVATION_RELATIONS_FULL_SELECT = `
  *,
  financial_responsible:clients!client_id(*),
  guest:clients!guest_id(*),
  rooms(${RESERVATION_ROOMS_EMBED_COLUMNS}),
  room_categories(${RESERVATION_ROOM_CATEGORIES_EMBED_COLUMNS}),
  reservation_service_fees(amount, quantity),
  pricing_plans(*)
`;

/** Mutations que só precisam de clientes + quarto + categoria (sem taxas/plano). */
export const RESERVATION_RELATIONS_ROOMS_CATEGORIES_SELECT = `
  *,
  financial_responsible:clients!client_id(*),
  guest:clients!guest_id(*),
  rooms(${RESERVATION_ROOMS_EMBED_COLUMNS}),
  room_categories(${RESERVATION_ROOM_CATEGORIES_EMBED_COLUMNS})
`;

/** Igual ao full, mas sem reservation_service_fees (ex.: retorno de update que já inclui pricing_plans). */
export const RESERVATION_RELATIONS_WITH_PRICING_PLAN_SELECT = `
  *,
  financial_responsible:clients!client_id(*),
  guest:clients!guest_id(*),
  rooms(${RESERVATION_ROOMS_EMBED_COLUMNS}),
  room_categories(${RESERVATION_ROOM_CATEGORIES_EMBED_COLUMNS}),
  pricing_plans(*)
`;

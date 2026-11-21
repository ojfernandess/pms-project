import type { ReservationImportPayload } from "./reservation-import.types";

export const RESERVATION_IMPORT_EXAMPLE: ReservationImportPayload = {
  version: "1.0",
  exported_at: "2026-11-21T12:00:00.000Z",
  establishment: {
    id: "00000000-0000-0000-0000-000000000000",
    external_code: "HOTEL-DEMO",
  },
  reservations: [
    {
      external_id: "PMS-ORIGEM-1001",
      reservation_code: "ABC12345",
      identification_number: "1001",
      status: "confirmed",
      payment_status: "paid",
      channel: "import",
      checkin_date: "2026-12-10",
      checkout_date: "2026-12-12",
      checkin_time: "14:00",
      checkout_time: "12:00",
      adults: 2,
      children: 0,
      total_amount: 500.0,
      paid_amount: 500.0,
      notes: "Reserva de exemplo para importação",
      mapping: {
        building_external_code: "B1",
        category_external_code: "STD",
        room_external_code: "101",
        pricing_plan_external_code: "BAR",
      },
      financial_responsible: {
        full_name: "Maria Silva",
        email: "maria.silva@example.com",
        phone: "+5511999990001",
        document_type: "cpf",
        document_number: "12345678901",
        city: "São Paulo",
        state: "SP",
        country: "Brasil",
      },
      guest: {
        full_name: "João Silva",
        email: "joao.silva@example.com",
        phone: "+5511999990002",
        document_type: "cpf",
        document_number: "98765432100",
        nationality: "Brasileira",
      },
      checkin: {
        completed: true,
        locator: "ABC12345",
        guests: [
          {
            name: "João Silva",
            document_type: "cpf",
            document_number: "98765432100",
            is_main_guest: true,
            email: "joao.silva@example.com",
          },
          {
            name: "Ana Silva",
            document_type: "cpf",
            document_number: "11122233344",
            is_main_guest: false,
          },
        ],
      },
      payments: [
        {
          amount: 500.0,
          payment_method: "pix",
          payment_date: "2026-11-20T15:30:00.000Z",
          notes: "Pagamento integral",
        },
      ],
    },
  ],
};

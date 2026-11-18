# Aplicar migração — Estacionamento (Postgres)

O PMS usa **PostgreSQL** direto (via backend / `DATABASE_URL`), não o fluxo `supabase db push`.

## Script idempotente

Arquivo: `backend/scripts/migration/parking_service.sql`

### Manual (produção ou ambiente local)

```bash
# URL só para psql (sem query string de pool)
psql "postgresql://USER:PASS@HOST:5432/pms" -v ON_ERROR_STOP=1 -f backend/scripts/migration/parking_service.sql
```

No container do backend:

```bash
cd /app
node ./scripts/print-database-url-libpq.mjs   # se precisar da URL libpq
psql "$(node ./scripts/print-database-url-libpq.mjs)" -v ON_ERROR_STOP=1 -f ./scripts/migration/parking_service.sql
```

### Automático

- Cada restart do **backend** executa este SQL em `docker-entrypoint.sh` (como `cleaning_fee_configuration.sql`).
- Opcional: `PRISMA_MIGRATE_ON_START=true` aplica também `backend/prisma/migrations/20261118140000_parking_service/`.

## Verificação

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reservations'
  AND column_name = 'lodging_reservation_id';
```

Deve retornar uma linha.
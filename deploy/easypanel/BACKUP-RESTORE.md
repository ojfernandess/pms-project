# Backup e restore — PostgreSQL e Redis (Easypanel)

## PostgreSQL (`pms-postgres`)

### Backup automatizado (painel)

1. Serviço `pms-postgres` → **Backups** (se disponível na sua edição Easypanel).
2. Defina destino (S3, outro volume) e agenda (ex. diário 02:00 UTC).
3. Guarde credenciais do destino fora do repositório.

### Backup manual (`pg_dump`)

A partir de um host com acesso à rede interna ou túnel:

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --file=stayos-$(date +%Y%m%d).dump
```

Para **só dados** (schema já existe):

```bash
pg_dump "$DATABASE_URL" --format=custom --data-only --file=stayos-data.dump
```

### Restore

```bash
pg_restore -d "$TARGET_DATABASE_URL" --clean --if-exists stayos-YYYYMMDD.dump
```

**Atenção:** `--clean` dropa objetos — use só em destino de teste ou com aprovação.

Para o pacote core do projeto:

```powershell
.\scripts\migration\restore-postgres-core.ps1
```

### Política recomendada

- Backup completo semanal + WAL/arquivo diário se suportado.
- Testar restore em staging **mensalmente**.
- Antes de upgrade de imagem Postgres: backup manual obrigatório.
- **Nunca** remover volume `pms-postgres` no redeploy de backend/frontend.

---

## Redis (`pms-redis`)

- Dados são cache/filas — persistência reduz perda após restart.
- Ative **volume/disk persistence** no serviço Redis do painel.
- Backup opcional: `redis-cli --rdb /backup/dump.rdb` (janela de baixa carga).

Após restore Postgres, filas Redis podem ser recriadas; jobs críticos reprocessam conforme BullMQ.

---

## Storage backend (`pms-backend` volume)

- Monte volume em `/app/storage`.
- Backup: `tar czf storage-backup.tgz -C /app storage` (exec no container ou snapshot do volume).
- Não incluído em dumps SQL.

---

## Rollback rápido

1. Pare backend/worker.
2. Restore último dump Postgres válido no volume ou nova instância.
3. `DATABASE_URL` coerente com instância restaurada.
4. Start backend → worker → front.

Se o problema for só código: rollback Git do serviço App **sem** tocar no Postgres.

# Dokploy — instalação StayOS PMS

## Ficheiro gerado

| Ficheiro | Uso |
| --- | --- |
| **`pms-install.base64`** | **Único conteúdo a colar no Import do Dokploy** |
| `pms-install.json` | Metadados + cópia do base64 (não cole o JSON inteiro no painel) |
| `docker-compose.yml` | Compose do serviço (build Git) |
| `template.toml` | Domínio, env e passwords geradas pelo Dokploy |

Regenerar após editar compose/tom:

```bash
node deploy/dokploy/scripts/export-pms-install.mjs
```

## Passos no Dokploy

1. **Project** → **Create Service** → **Compose** (crie o serviço vazio primeiro).
2. **Advanced** → **Import** → cole **apenas** o conteúdo de `pms-install.base64` (uma linha, começa por `eyJ...`).
3. **Preview** → confirme domínio no **frontend**, porta **80** → **Import**.

### Erro `Unexpected token` / `is not valid JSON`

O campo Import espera **Base64**, não JSON em texto. Se colar `pms-install.json`, ou o objeto `{"compose","config"}`, o Dokploy descodifica lixo e falha.

Copiar no Windows (PowerShell):

```powershell
Get-Content deploy\dokploy\pms-install.base64 -Raw | Set-Clipboard
```
4. **Source (obrigatório — não deixar só Raw após import)**:
   - Type: **GitHub** → `ojfernandess/pms-project`
   - Branch: **PMS-Backend**
   - **Root / build path:** raiz vazia (`/`)
   - **Compose file:** `docker-compose.dokploy.yml` (na raiz do repo)
   - Salvar → **Pull/Clone** → confirmar que existe pasta `backend/` no código clonado
5. Ative **HTTPS** no domínio do `frontend`.
6. Primeiro Postgres vazio: `PRISMA_MIGRATE_ON_START=true` → deploy → depois `false`.

### Erro `.../code/backend not found`

O log usa `code/docker-compose.yml` quando o Dokploy **não clonou** o monorepo (só ficou o YAML do import).

**Correção A (recomendada):** Compose file = **`docker-compose.dokploy.yml`** (build por **URL GitHub**, não precisa de `code/backend`).

**Correção B:** Source = GitHub, root `/`, Pull — e compose `docker-compose.dokploy.yml` com paths locais (versões antigas).

No painel, em **General / Compose path**, troca de `docker-compose.yml` para **`docker-compose.dokploy.yml`** e faz **Deploy**.

### Build ainda falha em `COPY scripts/... not found`

Nos logs, confirme:

- `load git source ...#PMS-Backend:backend` no build do **backend**
- Se aparecer só `#PMS-Backend` no backend: compose antigo ou **reimporte** `pms-install.base64` atual
- Faça **um deploy com cache limpo** (opção *Clean cache* / rebuild sem cache no Dokploy) — camadas CACHED de contexto errado quebram o build

## Postgres vazio: `Tabela não encontrada: site_settings`

O backend sobe, mas o **schema PMS** (centenas de tabelas `public.*`) não vem do build. É preciso **pg_restore** do Easypanel (sandbox) ou aplicar `supabase/migrations`.

- `PRISMA_MIGRATE_ON_START=true` só aplica migracoes Nest (2 ficheiros), **nao** o schema completo.
- Apos deploy, veja logs: `Schema PMS incompleto` ou `check-public-schema`.
- Diagnostico: `GET https://myapi.../health?deep=1` → `schema.ready: false`.
- Opcional: `PMS_REQUIRE_PUBLIC_SCHEMA=true` para falhar o container sem schema (apos import).

Documentação geral: [../README.md](../README.md). [../../docs/migration/easypanel-postgres-cutover.md](../../docs/migration/easypanel-postgres-cutover.md).
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

- **Source não é Git** ou o clone falhou → configurar GitHub como acima.
- **Compose errado** → usar `docker-compose.dokploy.yml`, não só o YAML colado no import (paths relativos à raiz).
- Alternativa: `deploy/dokploy/docker-compose.yml` (paths `../../backend`) se insistir neste path.

Documentação geral: [../README.md](../README.md).
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
4. **Source**: GitHub `ojfernandess/pms-project`, branch `PMS-Backend`, raiz do repo; compose path `deploy/dokploy/docker-compose.yml` (se o import não fixar sozinho).
5. Ative **HTTPS** no domínio gerado.
6. Primeiro deploy com Postgres vazio: `PRISMA_MIGRATE_ON_START=true` → deploy → depois `false`.

Documentação geral: [../README.md](../README.md).
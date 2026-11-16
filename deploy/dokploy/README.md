# Dokploy — instalação StayOS PMS

## Ficheiro gerado

| Ficheiro | Uso |
| --- | --- |
| `pms-install.json` | Metadados + `dokploy.base64` para colar no import |
| `docker-compose.yml` | Compose do serviço (build Git) |
| `template.toml` | Domínio, env e passwords geradas pelo Dokploy |

Regenerar após editar compose/tom:

```bash
node deploy/dokploy/scripts/export-pms-install.mjs
```

## Passos no Dokploy

1. **Project** → **Create Service** → **Compose**.
2. **Advanced** → **Import** → cole o valor de `dokploy.base64` em `pms-install.json`.
3. Confirme o preview (domínio no **frontend**, porta **80**).
4. **Source**: GitHub `ojfernandess/pms-project`, branch `PMS-Backend`, raiz do repo; compose path `deploy/dokploy/docker-compose.yml` (se o import não fixar sozinho).
5. Ative **HTTPS** no domínio gerado.
6. Primeiro deploy com Postgres vazio: `PRISMA_MIGRATE_ON_START=true` → deploy → depois `false`.

Documentação geral: [../README.md](../README.md).
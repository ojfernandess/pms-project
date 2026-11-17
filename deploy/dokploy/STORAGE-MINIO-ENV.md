# MinIO / STORAGE — variáveis no Dokploy

## Sintoma

Super Admin → **Testar conexão (env)** mostra:

- `process.env STORAGE_PROVIDER: não`
- `STORAGE_PROVIDER (env): (vazio)`

Isso **não** é bug do MinIO: o **container `backend` (API / myapi)** não recebe as variáveis.

## Como o Dokploy injeta env (Compose)

1. Você preenche **Environment** no projeto Compose.
2. O Dokploy gera um ficheiro **`.env`** na pasta do projeto no servidor.
3. O `docker compose --env-file .env ...` usa esse ficheiro para:
   - substituir `${VAR}` no YAML **e**
   - (com `env_file: .env` no serviço `backend`) copiar **todas** as linhas para o container.

### Erro comum A — variáveis só no stack MinIO

`STORAGE_PROVIDER` e `MINIO_*` devem estar no **mesmo projeto Compose do PMS** (`pms-staysos-api`), **não** no serviço/aplicação MinIO separado.

### Erro comum B — compose antigo no painel (Import)

Se instalou com **Import** (`pms-install.base64`) e **nunca** apontou o compose para o Git:

- O YAML guardado no Dokploy pode **não** ter `STORAGE_PROVIDER` / `env_file`.
- Adicionar vars no Environment **não** chega ao Node se o serviço `backend` não as mapeia.

**Correção:**

1. **General** → **Compose file**: `docker-compose.dokploy.yml` (raiz do repo, branch `PMS-Backend`).
2. **Pull** do GitHub + **Deploy** (rebuild).
3. Ou reimportar `pms-install.base64` **regenerado** após `node deploy/dokploy/scripts/export-pms-install.mjs`.

### Erro comum C — formato no Environment

- Uma variável por linha: `STORAGE_PROVIDER=minio` (sem aspas).
- **Não** repita o prefixo: errado `DATABASE_URL=DATABASE_URL=postgresql://...`.
- Valores com caracteres especiais: URL-encode se necessário.

### Erro comum D — só restart sem redeploy

Após alterar Environment, faça **Deploy** (recreate), não só restart rápido.

## Valores StayOS (API pública S3)

No **Environment do Compose PMS**:

```env
STORAGE_PROVIDER=minio
MINIO_ENDPOINT=s3.stayos.com.br
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=stayospms
MINIO_REGION=us-east-1
```

(`storage.stayos.com.br` é o **console**; a API PMS usa **`s3.stayos.com.br`**.)

## Verificação rápida (sem Super Admin)

1. **Logs do container `backend`** no arranque:
   - OK: `Storage env: STORAGE_PROVIDER=minio MINIO_ENDPOINT=s3.stayos.com.br ...`
   - Problema: `WARN: STORAGE_PROVIDER ausente no container`

2. **Health deep** (substitua o host da API):

   `GET https://myapi.stayos.com.br/health?deep=1`

   Deve incluir `storageEnv.processEnv.STORAGE_PROVIDER: true` quando correto.

3. **Shell no container backend**:

   ```bash
   env | grep -E '^STORAGE_|^MINIO_'
   ```

## Alternativa: uma única variável (se MINIO_* não aparecem no container)

No **Environment** do Compose PMS, adicione **só** esta linha (JSON numa linha, sem quebras):

```env
PMS_STORAGE_JSON={"provider":"minio","endpoint":"s3.stayos.com.br","port":443,"useSSL":true,"accessKey":"SUA_KEY","secretKey":"SUA_SECRET","bucket":"stayospms","region":"us-east-1"}
```

No Dokploy, pode ser mais fácil que oito variáveis `MINIO_*`. Após deploy, `/health?deep=1` deve mostrar `pmsStorageJson: true` e `processEnv.STORAGE_PROVIDER: true`.

## Checklist Dokploy

| Passo | Verificar |
| --- | --- |
| Projeto | Compose StayOS PMS (não só MinIO) |
| Source | Git `PMS-Backend`, compose `docker-compose.dokploy.yml` |
| Environment | `STORAGE_*` e `MINIO_*` definidos |
| Deploy | Após mudar env, redeploy completo |
| Commit | `369a37d+` no compose (`environment` + `env_file`) |
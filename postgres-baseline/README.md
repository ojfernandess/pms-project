# Artefactos de baseline (não versionados)

Coloque aqui dumps exportados de **produção** para builds ou volumes Easypanel:

- `pms-baseline-YYYYMMDD.schema.dump` — schema `public` + `auth`
- (opcional) `pms-baseline-YYYYMMDD.core-data.dump` — subset dev

Gerar com:

```powershell
$env:SOURCE_DATABASE_URL = "postgresql://..."
.\scripts\migration\export-postgres-baseline.ps1
```

Copie o `.schema.dump` para o volume do backend em Easypanel:

`/app/storage/baseline/`

A pasta `postgres-dumps/` na raiz também é usada em export local (`.gitignore`).
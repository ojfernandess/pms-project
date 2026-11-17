# Modo B — API em `myapi.*` (StayOS)

| Serviço | Domínio Dokploy | Container |
|---------|-----------------|-----------|
| SPA (PMS + check-in) | `pms.stayos.com.br`, `checkin.stayos.com.br` | `frontend:80` |
| API Nest | `myapi.stayos.com.br` | `backend:3000` |

## Environment

```env
VITE_PMS_API_URL=https://myapi.stayos.com.br
PMS_API_URL=https://myapi.stayos.com.br
VITE_APP_URL=https://pms.stayos.com.br
PUBLIC_APP_URL=https://pms.stayos.com.br
CORS_ORIGINS=https://pms.stayos.com.br,https://checkin.stayos.com.br
```

O **frontend** precisa de `VITE_PMS_API_URL` e `PMS_API_URL` em **runtime** (`runtime-config.js`) e no **build**.

**Não** use `index.html` para forçar `pmsApiUrl` = origem da página (isso gera 502 no proxy nginx).

## 502 em `pms.stayos.com.br/rest`

O browser deve chamar **`https://myapi.stayos.com.br`**, não o proxy do SPA. Se vir 502 em `pms.../auth`, o bundle ainda está em modo proxy errado — rebuild do frontend.

## resolve-hostname

Com API externa, o cliente envia `?hostname=checkin...` e header `X-PMS-Visitor-Host` para o backend classificar o host do visitante.
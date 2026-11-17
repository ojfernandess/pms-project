# Domínios personalizados — Web Check-in (entrega técnica)

## Diagnóstico da causa original

| Camada | Problema |
|--------|----------|
| **Infra (Dokploy/Traefik)** | Host `checkin.*` precisava de entrada em **Domains** no serviço `frontend:80` + variáveis no container `frontend` |
| **runtime-config.js** | `WEB_CHECKIN_*` / `VITE_*` não chegavam ao container → SPA não reconhecia o host |
| **Roteamento React** | Sem host reconhecido, `/` usava `CustomDomainDetector` → `/login` (PMS) |
| **Modelo de dados** | Só `site_settings.web_checkin_public_base_url` (global), sem tabela de domínios validados |

**Por que abria o PMS:** o hostname não era classificado como `web_checkin` antes do fallback de rotas do painel.

## Arquitetura implementada

1. **API pública** `GET /functions/v1/resolve-hostname` — classifica o host (`pms`, `web_checkin`, `booking_engine`, `unconfigured`, `pending`, `suspended`) usando `Host` / `X-Forwarded-Host`.
2. **Tabela** `platform_custom_domains` — cadastro, token TXT, status DNS/SSL, vínculo opcional com `companies`.
3. **SPA** — `useHostnameResolution()` na mesma origem do visitante → `WebCheckinDedicatedAppRoutes` sem redirect externo.
4. **Super Admin** — `PlatformCustomDomainsManager` (listar, cadastrar, verificar, diagnosticar).
5. **Compatibilidade** — `site_settings.web_checkin_public_base_url` continua válido até migrar para a tabela.

## DNS (StayOS)

| Tipo | Nome | Destino |
|------|------|---------|
| CNAME | `checkin` | hostname do PMS (ex. `pms.stayos.com.br`) |
| TXT | `_pms-verification.checkin.stayos.com.br` | `pms-domain-verification=<token>` (painel) |

**Dokploy Environment (frontend + projeto):**

```env
VITE_PMS_API_URL=https://pms.stayos.com.br
VITE_APP_URL=https://pms.stayos.com.br
PUBLIC_APP_URL=https://pms.stayos.com.br
PLATFORM_DNS_CNAME_TARGET=pms.stayos.com.br
WEB_CHECKIN_PUBLIC_HOST=checkin.stayos.com.br
WEB_CHECKIN_PUBLIC_URL=https://checkin.stayos.com.br
```

**SSL:** Let's Encrypt via Traefik (Dokploy) — um domínio por entrada em **Domains**. Renovação automática no proxy.

## Testes

```bash
curl -s https://checkin.stayos.com.br/functions/v1/resolve-hostname
# mode: web_checkin, active: true

curl -s https://checkin.stayos.com.br/runtime-config.js
# webCheckinPublicHost preenchido após redeploy frontend
```

## Intervenção manual ainda necessária

- Adicionar cada novo hostname em **Dokploy → Domains → frontend:80**
- Incluir origem HTTPS em `CORS_ORIGINS` ou `WEB_CHECKIN_PUBLIC_URL` no backend
- TXT de verificação antes de marcar domínio como `active` na tabela centralizada

## Arquivos principais

- Backend: `backend/src/edge/platform-domains.service.ts`, `backend/src/lib/hostname.util.ts`
- Frontend: `src/hooks/useHostnameResolution.ts`, `src/App.tsx`
- DB: `supabase/migrations/20260310120000_platform_custom_domains.sql`
- Deploy: `docker-compose.dokploy.yml`, `deploy/frontend/40-generate-runtime-config.sh`
# checkin.seudominio.com — 404 page not found (solução robusta)

## Por que dá 404?

O DNS (CNAME/A) chega ao servidor, mas o **Traefik do Dokploy** só encaminha hosts que estão **cadastrados**.  
`404 page not found` (texto curto, `text/plain`) = **sem rota** para `Host: checkin.stayos.com.br` — não é erro do React.

O PMS (`pms.stayos.com.br`) usa o serviço **`frontend`**.  
O Web Check-in dedicado usa o serviço **`webcheckin`** (mesma imagem, rota Traefik própria).

---

## Solução recomendada (Dokploy UI)

1. **DNS (Cloudflare):** CNAME `checkin` → `pms.stayos.com.br` (só hostname, sem `/web-checkin`).
2. Dokploy → projeto PMS → **Domains** → **Create Domain**
   - **Host:** `checkin.stayos.com.br`
   - **Service:** `webcheckin` ← **não** use `frontend`
   - **Container port:** `80`
   - **HTTPS:** ON (Let's Encrypt ou None se SSL só no Cloudflare)
3. **Redeploy** o compose (branch com serviço `webcheckin` no `docker-compose.dokploy.yml`).
4. Super Admin:
   - **URL Base do PMS:** `https://pms.stayos.com.br`
   - **URL pública Web Check-in:** `https://checkin.stayos.com.br`
5. Environment (frontend **e** webcheckin):

```env
WEB_CHECKIN_PUBLIC_HOST=checkin.stayos.com.br
WEB_CHECKIN_TRAEFIK_RULE=Host(`checkin.stayos.com.br`)
WEB_CHECKIN_PUBLIC_URL=https://checkin.stayos.com.br
```

Gere a regra com vários domínios:

```bash
node deploy/dokploy/scripts/web-checkin-traefik-rule.mjs https://checkin.stayos.com.br https://checkin2.outro.com
```

---

## Solução B — só variáveis (labels Traefik)

Se não usar a aba Domains, defina `WEB_CHECKIN_TRAEFIK_RULE` e `WEB_CHECKIN_PUBLIC_HOST` no Environment e redeploy.  
Os labels ficam no serviço **`webcheckin`** no compose.

---

## Solução C — Cloudflare (sem segundo domínio no Dokploy)

Regra de **Origin** / Transform: para hostname `checkin.stayos.com.br`, enviar à origem com header **Host: pms.stayos.com.br**.  
O browser continua em `checkin.*`; configure `WEB_CHECKIN_PUBLIC_HOST` no frontend para as rotas SPA.

---

## Teste

```bash
curl -k -sI https://checkin.stayos.com.br/
```

| Resultado | Significado |
|-----------|-------------|
| `200` + `Server: nginx` | OK |
| `404` + `text/plain` | Falta domínio no Dokploy (serviço **webcheckin**) ou env/rule |

---

## Vários domínios de check-in

Use:

```env
WEB_CHECKIN_TRAEFIK_RULE=Host(`checkin.hotel-a.com`) || Host(`checkin.hotel-b.com`)
WEB_CHECKIN_PUBLIC_HOST=checkin.hotel-a.com
```

Cada host precisa de entrada DNS + certificado (ou Domains no Dokploy por host).
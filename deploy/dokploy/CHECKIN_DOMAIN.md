# checkin.seudominio.com — 404 page not found (Dokploy + Cloudflare)

## Diagnóstico

Se `https://pms.stayos.com.br` abre o PMS (nginx) e `https://checkin.stayos.com.br` devolve só **`404 page not found`** (texto curto, `text/plain`), o DNS está a chegar ao servidor, mas o **Traefik do Dokploy não tem rota** para o header `Host: checkin.stayos.com.br`.

CNAME `checkin` → `pms.stayos.com.br` no Cloudflare está correto. **Não** use `/web-checkin` no DNS.

---

## Solução A — Domains no Dokploy (recomendado)

1. Abra o projeto **Docker Compose** do PMS no Dokploy.
2. Aba **Domains** → **Create Domain**.
3. Preencha:
   - **Host:** `checkin.stayos.com.br`
   - **Path:** `/`
   - **Container port:** `80` (serviço **frontend**, nginx — **não** use 3000 do backend)
   - **HTTPS:** ON
   - **Certificate:** Let's Encrypt (ou None se SSL só no Cloudflare)
4. Salve e faça **Redeploy** do compose.
5. Aguarde ~1 minuto e teste `https://checkin.stayos.com.br`.

Documentação Dokploy: [Domains](https://docs.dokploy.com/docs/core/domains/cloudflare), [Others](https://docs.dokploy.com/docs/core/domains/others).

---

## Solução B — Variável no compose (Git)

No **Environment** do compose no Dokploy:

```env
WEB_CHECKIN_PUBLIC_HOST=checkin.stayos.com.br
```

(O valor é só o hostname, sem `https://`.)

O `docker-compose.dokploy.yml` na branch `PMS-Backend` inclui labels Traefik para esse host. Depois: **Redeploy**.

Também no serviço **frontend** (runtime):

```env
WEB_CHECKIN_PUBLIC_HOST=checkin.stayos.com.br
```

No **backend** (se a API for outro domínio, ex. `myapi.*`):

```env
WEB_CHECKIN_PUBLIC_URL=https://checkin.stayos.com.br
```

---

## Cloudflare

| Tipo | Nome | Destino |
|------|------|---------|
| CNAME | checkin | `pms.stayos.com.br` |

- **SSL/TLS:** Full (strict) se a origem tiver certificado para `checkin` (após Solução A ou B).
- **Error 1016:** destino CNAME inválido (nunca use barra no nome).

---

## Super Admin

**URL pública do Web Check-in:** `https://checkin.stayos.com.br`

Link exemplo: `https://checkin.stayos.com.br/RSV154684`

---

## Teste rápido

```bash
curl -k -sI https://checkin.stayos.com.br/
```

- **200** + `Server: nginx` → OK  
- **404** + `text/plain` → falta rota Traefik (Solução A ou B)
# Domínio dedicado do Web Check-in (ex. checkin.seudominio.com)

## Regra de ouro do DNS

**CNAME e registro A apontam só para servidor ou hostname — nunca para URL com caminho.**

| Errado (não funciona) | Correto |
|----------------------|---------|
| `pms.stayos.com.br/web-checkin` | `pms.stayos.com.br` |
| `https://pms.stayos.com.br` no campo CNAME | `pms.stayos.com.br` |

O caminho `/web-checkin` ou `/{localizador}` é tratado **pela aplicação**, não pelo DNS.  
Link para o hóspede: `https://checkin.seudominio.com/RSV154684` (configurado no Super Admin, não no Cloudflare).

---

## Cloudflare

### Opção 1 — CNAME (recomendada, mesmo zone)

| Tipo | Nome | Conteúdo / destino | Proxy |
|------|------|---------------------|-------|
| CNAME | `checkin` | `pms.stayos.com.br` | Proxied (laranja) ou DNS only |

- **Error 1016 (Origin DNS error):** destino inválido (ex. CNAME com `/web-checkin`), DNS não propagado ou origem não aceita o host `checkin`.
- SSL/TLS: **Full (strict)** se a origem tiver certificado válido para `checkin`.

### Opção 2 — Registro A

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| A | `checkin` | **Mesmo IP público** do registro A de `pms` | Proxied ou DNS only |

**404 page not found** no registro A quase sempre significa: o **proxy/reverse proxy** (Traefik, nginx da hospedagem) **não tem rota** para o host `checkin.seudominio.com`. O IP está certo, mas falta cadastrar o domínio no serviço do **frontend**.

---

## Hospedagem (obrigatório)

No painel onde o **frontend do PMS** está publicado:

1. Abra o serviço/app do **frontend** (o mesmo de `pms.stayos.com.br`).
2. **Domínios** → adicione `checkin.seudominio.com` (HTTPS).
3. Redeploy ou recarregue o proxy se necessário.

Sem esse passo, A e CNAME chegam ao servidor, mas o proxy responde **404** antes do nginx da SPA.

---

## Variáveis de ambiente (opcional, recomendado)

**Frontend** (runtime no container):

```env
WEB_CHECKIN_PUBLIC_HOST=checkin.stayos.com.br
# Com API em outro host (ex. myapi...), no checkin use origem relativa ou:
VITE_PMS_API_URL=https://checkin.stayos.com.br
```

**Backend** (se a API for chamada de `checkin` com origem diferente de `PUBLIC_APP_URL`):

```env
WEB_CHECKIN_PUBLIC_URL=https://checkin.stayos.com.br
# ou CORS_ORIGINS=https://pms.stayos.com.br,https://checkin.stayos.com.br
```

**Super Admin** → URL pública do Web Check-in: `https://checkin.stayos.com.br`

---

## Teste

1. `https://checkin.seudominio.com` → tela de busca/localizador do Web Check-in.  
2. `https://checkin.seudominio.com/RSVXXXX` → fluxo com localizador.

Se vir **404 page not found** (texto curto, sem layout do PMS) → proxy/hospedagem.  
Se vir layout do PMS com erro → conferir Super Admin, coluna no banco e `WEB_CHECKIN_PUBLIC_HOST`.
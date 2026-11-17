# Domínio dedicado do Web Check-in (ex. checkin.seudominio.com)

## PMS vs Web Check-in

| Uso | Configuração Super Admin | Exemplo |
|-----|--------------------------|---------|
| Equipe, Super Admin, operação | **URL Base do PMS** | `https://pms.stayos.com.br` |
| Links para hóspedes | **URL pública do Web Check-in** | `https://checkin.stayos.com.br` |

O domínio `checkin` serve só o fluxo do hóspede. Rotas administrativas redirecionam para `pms_base_url`.

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

## Hospedagem — Dokploy (obrigatório)

O compose inclui dois serviços de SPA:

Um único serviço **`frontend`**, dois domínios no Dokploy:

| Domínio | Quem acessa |
|---------|-------------|
| `pms.stayos.com.br` | Equipe / Super Admin |
| `checkin.stayos.com.br` | Hóspedes |

1. **Domains** → Create Domain → host `checkin...` → serviço **`frontend`** → porta **80**.
2. Defina `WEB_CHECKIN_PUBLIC_HOST` e `WEB_CHECKIN_TRAEFIK_RULE` (veja checklist no Super Admin).
3. Redeploy.

Guia detalhada: [deploy/dokploy/CHECKIN_DOMAIN.md](../deploy/dokploy/CHECKIN_DOMAIN.md).

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
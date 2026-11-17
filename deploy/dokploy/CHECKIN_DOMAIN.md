# checkin.seudominio.com — 404 page not found

## Um serviço `frontend`, dois domínios

Não é necessário um serviço separado `webcheckin`. O mesmo container **frontend** atende:

| Domínio | Quem acessa |
|---------|-------------|
| `pms.stayos.com.br` | Equipe / Super Admin |
| `checkin.stayos.com.br` | Hóspedes (só fluxo check-in) |

No Dokploy: **dois registros** em **Domains**, ambos apontando para o serviço **`frontend`**, porta **80**.

---

## Compose desatualizado no Dokploy?

Se você não vê mudanças no compose após git push:

1. **General** → **Compose File** = `docker-compose.dokploy.yml` (raiz do repo)
2. **Branch** = `PMS-Backend`
3. **Pull** / atualizar código do Git
4. **Deploy** (opção *limpar cache* se existir)

Opcional: regenerar import local e reimportar:

```bash
node deploy/dokploy/scripts/export-pms-install.mjs
```

Cole o novo `deploy/dokploy/pms-install.base64` em **Advanced → Import** (só se o projeto foi criado por import antigo).

---

## Passos (StayOS)

1. **Cloudflare:** CNAME `checkin` → `pms.stayos.com.br`
2. **Environment:**

```env
WEB_CHECKIN_PUBLIC_HOST=checkin.stayos.com.br
WEB_CHECKIN_TRAEFIK_RULE=Host(`checkin.stayos.com.br`)
WEB_CHECKIN_PUBLIC_URL=https://checkin.stayos.com.br
```

3. **Domains** (já deve existir `pms` no frontend):
   - **Create Domain** → `checkin.stayos.com.br` → service **`frontend`** → port **80** → HTTPS ON
4. **Redeploy**
5. Super Admin: URL Base PMS + URL pública Web Check-in

---

## Teste

`curl -k -sI https://checkin.stayos.com.br/` → `200` e `Server: nginx`
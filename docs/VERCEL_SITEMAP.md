# SEO por domínio e em qualquer ambiente

Cada **domínio personalizado** ou **página do motor de reservas** (empresa) tem seu próprio SEO: sitemap e robots.txt filtrados por esse site.

## Lógica de resolução do “site”

As Edge Functions (sitemap e robots) decidem **qual site** atender usando, nesta ordem:

1. **Header `Host` ou `X-Forwarded-Host`** – domínio da requisição (ex: `hotel-a.com`).
2. **Query** `?domain=hotel-a.com` ou `?company=slug-da-empresa` – útil quando o proxy não repassa o Host.

- Se o **Host** (ou `domain`) bater com um **domínio customizado** de uma empresa (`companies.seo_custom_domain`), o sitemap/robots é **só dessa empresa** (base URL da empresa, motor dessa empresa, estabelecimentos dessa empresa).
- Se for passado **`company=slug`**, usa a empresa com esse `booking_engine_slug`.
- Se não houver match, usa o **site global** (configuração em `site_settings`: todas as empresas e estabelecimentos).

## Configuração por empresa (SEO próprio)

Na base de dados, cada empresa pode ter:

| Campo | Descrição |
|-------|-----------|
| `seo_custom_domain` | Domínio que identifica a empresa (ex: `reservas.hotel-a.com`). Sem porta; armazenar em minúsculo. |
| `seo_base_url` | URL base para links no sitemap (ex: `https://reservas.hotel-a.com`). |
| `robots_txt` | Conteúdo do robots.txt dessa empresa. Se vazio/null, usa o padrão (Allow/Disallow + Sitemap). |

Quando uma requisição chega com `Host = seo_custom_domain` (ou `?domain=...`), o sitemap lista apenas:

- Base da empresa (`seo_base_url` ou global)
- `/motor`, `/login`, `/motor/:slug-da-empresa`
- `/reservar/:slug` só dos estabelecimentos dessa empresa

O robots.txt devolve `companies.robots_txt` se existir; senão, o padrão com `Sitemap: {seo_base_url}/sitemap.xml`.

## Funcionar em qualquer ambiente (não só Vercel)

A geração de sitemap e robots fica nas **Edge Functions do Supabase**. Em qualquer hospedagem você só precisa:

- Expor **`/sitemap.xml`** e **`/robots.txt`** no mesmo domínio do site.
- Fazer um **proxy** dessas URLs para as Edge Functions, **repassando o Host** da requisição (para o Supabase decidir qual site usar).

### Opção 1: Proxy no próprio projeto (Vercel, Netlify, etc.)

Os arquivos **`api/sitemap.ts`** e **`api/robots.ts`** já fazem isso: chamam as Edge Functions e repassam `Host` e `X-Forwarded-Host`.

- **Vercel:** em `vercel.json` já existem os rewrites:
  - `/sitemap.xml` → `/api/sitemap`
  - `/robots.txt` → `/api/robots`
- **Netlify:** use Redirects/Proxy no `netlify.toml` ou uma Function em `netlify/functions/` que faça o mesmo (fetch na Edge Function com o Host da requisição).
- **Outro Node/Express:** crie rotas GET `/sitemap.xml` e `/robots.txt` que façam `fetch(edgeUrl, { headers: { Host: req.headers.host } })` e devolvam o corpo com o Content-Type correto.

Em todos os casos, a variável de ambiente **SUPABASE_URL** (ou `VITE_SUPABASE_URL`) deve apontar para o projeto Supabase (ex: `https://xxxx.supabase.co`).

### Opção 2: Chamar a Edge Function direto (sem proxy)

Se o front estiver em um domínio e você não precisar que sitemap/robots estejam no mesmo domínio:

- Sitemap: `GET https://<project>.supabase.co/functions/v1/sitemap`  
  Passar o domínio desejado: header `Host: seu-dominio.com` ou `?domain=seu-dominio.com`.
- Robots: `GET https://<project>.supabase.co/functions/v1/robots`  
  Mesmo esquema de Host ou `?domain=...`.

No `robots.txt` você pode apontar, por exemplo:  
`Sitemap: https://<project>.supabase.co/functions/v1/sitemap?domain=seu-dominio.com`

Recomendação: usar **proxy no mesmo domínio** (Opção 1) para que a URL do sitemap seja `https://seu-dominio.com/sitemap.xml`.

## Variáveis de ambiente (proxy)

No ambiente onde rodam `api/sitemap` e `api/robots` (ex.: Vercel, Netlify):

- **SUPABASE_URL** ou **VITE_SUPABASE_URL** ou **NEXT_PUBLIC_SUPABASE_URL**: `https://<seu-project-ref>.supabase.co`

Não é necessário configurar Service Role no proxy; as Edge Functions usam as variáveis do projeto Supabase.

## Resumo

- **Um site por domínio/empresa:** configure `seo_custom_domain` e `seo_base_url` (e opcionalmente `robots_txt`) na empresa para que esse domínio tenha sitemap e robots próprios.
- **Qualquer hospedagem:** use os proxies `api/sitemap` e `api/robots` (ou equivalente) e repasse o **Host** da requisição para as Edge Functions; em Vercel isso já está coberto por `vercel.json`.

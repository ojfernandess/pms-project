# Debug Open Graph - Guia de Troubleshooting

## Problemas Identificados

1. **Edge Function não mostra logs** - A função pode não estar sendo chamada
2. **Facebook mostra "Carregando..."** - O HTML renderizado não está sendo servido
3. **og:image vazio** - A imagem não está sendo retornada ou está vazia

## Como Verificar

### 1. Verificar se o Middleware está Funcionando

O middleware do Vercel Edge Functions pode não estar sendo executado. Para verificar:

1. Acesse os logs do Vercel no dashboard
2. Procure por logs que começam com "Crawler detectado:"
3. Se não houver logs, o middleware não está sendo executado

### 2. Testar a Edge Function Diretamente

Teste a Edge Function diretamente no navegador ou com curl:

```bash
curl "https://[SEU_PROJETO].supabase.co/functions/v1/render-html?path=/&siteUrl=https://pms.stayos.com.br"
```

Você deve ver:
- Logs no dashboard do Supabase
- HTML com meta tags preenchidas

### 3. Testar a API Route

Teste a API route com um User-Agent de crawler:

```bash
curl -A "facebookexternalhit/1.1" "https://pms.stayos.com.br/api/render-html?path=/&siteUrl=https://pms.stayos.com.br"
```

### 4. Verificar Variáveis de Ambiente

No Vercel, verifique se as seguintes variáveis estão configuradas:
- `VITE_SUPABASE_URL` ou `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (apenas para Edge Functions)

### 5. Verificar Configurações do Site

No banco de dados Supabase, verifique se a tabela `site_settings` tem:
- `site_title` preenchido
- `og_title` preenchido (ou será usado `site_title`)
- `og_description` preenchido (ou será usado `site_description`)
- `og_image` preenchido com URL absoluta (ex: `https://pms.stayos.com.br/imagem.png`)

## Soluções Alternativas

### Se o Middleware não Funcionar

O Vercel Edge Middleware pode não funcionar para projetos Vite/React. Nesse caso:

1. **Usar a API Route diretamente**: Configure o `vercel.json` para fazer rewrite baseado em User-Agent
2. **Usar Cloudflare Workers**: Se estiver usando Cloudflare, configure um Worker para interceptar crawlers
3. **Usar um serviço de proxy**: Configure um proxy reverso que detecta crawlers

### Solução Temporária: Atualizar index.html

Enquanto o problema não é resolvido, você pode atualizar o `index.html` para ter valores padrão:

```html
<meta property="og:title" content="Seu Título Padrão" />
<meta property="og:description" content="Sua Descrição Padrão" />
```

Mas isso não é ideal porque não será dinâmico.

## Próximos Passos

1. Verificar logs do Vercel para ver se o middleware está sendo executado
2. Testar a Edge Function diretamente
3. Verificar se as variáveis de ambiente estão configuradas
4. Verificar se as configurações do site estão no banco de dados
5. Se necessário, usar a solução alternativa com vercel.json


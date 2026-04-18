# Configuração Open Graph para Crawlers

## Problema

Os crawlers do Facebook, WhatsApp e outras redes sociais **não executam JavaScript**. Isso significa que as meta tags Open Graph injetadas via JavaScript no `index.html` não são visíveis para eles, resultando em um estado de "carregando" quando o link é compartilhado.

## Solução Implementada

Foram criadas duas soluções para resolver este problema:

### 1. Edge Function `render-html` (Supabase)

A Edge Function `supabase/functions/render-html/index.ts` busca as configurações do site do banco de dados e retorna um HTML completo com as meta tags Open Graph já preenchidas.

**URL da Edge Function:**
```
https://[SEU_PROJETO].supabase.co/functions/v1/render-html?path=/&siteUrl=https://[SEU_DOMINIO]
```

### 2. API Route `api/render-html.ts` (Vercel)

A API route detecta crawlers pelo User-Agent e serve o HTML renderizado pela Edge Function do Supabase.

**URL da API Route:**
```
https://[SEU_DOMINIO]/api/render-html?path=/&siteUrl=https://[SEU_DOMINIO]
```

## Como Funciona

1. Quando um crawler (Facebook, WhatsApp, etc.) acessa o site, ele envia um User-Agent específico
2. A API route `api/render-html.ts` detecta esse User-Agent
3. A API route chama a Edge Function `render-html` do Supabase
4. A Edge Function busca as configurações do site do banco de dados
5. A Edge Function retorna um HTML completo com as meta tags Open Graph preenchidas
6. O crawler recebe o HTML com as meta tags corretas

## Configuração Necessária

### 1. Variáveis de Ambiente no Vercel

Certifique-se de que as seguintes variáveis de ambiente estão configuradas no Vercel:

- `VITE_SUPABASE_URL` ou `SUPABASE_URL`: URL do seu projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Chave de serviço do Supabase (para a Edge Function)

### 2. Deploy da Edge Function

Certifique-se de que a Edge Function `render-html` está deployada no Supabase:

```bash
supabase functions deploy render-html
```

### 3. Configuração do Banco de Dados

Certifique-se de que a tabela `site_settings` existe e contém as configurações do site, incluindo:
- `site_title`
- `site_description`
- `meta_description`
- `og_title`
- `og_description`
- `og_image`

## Testando a Solução

### 1. Testar a Edge Function diretamente

Acesse a URL da Edge Function no navegador:
```
https://[SEU_PROJETO].supabase.co/functions/v1/render-html?path=/&siteUrl=https://[SEU_DOMINIO]
```

Você deve ver o HTML com as meta tags preenchidas.

### 2. Testar a API Route

Acesse a URL da API Route com um User-Agent de crawler:
```bash
curl -A "facebookexternalhit/1.1" "https://[SEU_DOMINIO]/api/render-html?path=/&siteUrl=https://[SEU_DOMINIO]"
```

Você deve receber o HTML renderizado.

### 3. Testar com Facebook Debugger

1. Acesse: https://developers.facebook.com/tools/debug/
2. Cole a URL do seu site
3. Clique em "Debug"
4. Verifique se as meta tags Open Graph aparecem corretamente

### 4. Testar com WhatsApp

1. Compartilhe a URL do seu site no WhatsApp
2. Verifique se o preview aparece corretamente com título, descrição e imagem

## Troubleshooting

### Problema: Meta tags ainda não aparecem

**Solução:**
1. Verifique se a Edge Function está deployada corretamente
2. Verifique se as variáveis de ambiente estão configuradas no Vercel
3. Verifique se as configurações do site estão salvas no banco de dados
4. Limpe o cache do Facebook/WhatsApp usando as ferramentas de debug

### Problema: Erro 500 na API Route

**Solução:**
1. Verifique os logs do Vercel para ver o erro específico
2. Verifique se `VITE_SUPABASE_URL` ou `SUPABASE_URL` está configurado
3. Verifique se a Edge Function está acessível

### Problema: Imagem Open Graph não aparece

**Solução:**
1. Certifique-se de que a URL da imagem é absoluta (começa com `http://` ou `https://`)
2. Certifique-se de que a imagem é acessível publicamente
3. Certifique-se de que a imagem tem pelo menos 200x200 pixels (recomendado: 1200x630 pixels)
4. Evite usar `data:` URLs, pois não funcionam com Open Graph

## Limitações

1. **Cache das Redes Sociais**: Facebook, WhatsApp e outras redes sociais fazem cache das meta tags. Após atualizar as configurações, pode levar alguns minutos ou horas para o cache ser atualizado. Use as ferramentas de debug para forçar a atualização.

2. **User-Agent Detection**: A detecção de crawlers é baseada em User-Agent, que pode mudar. Se um novo crawler não for detectado, adicione seu User-Agent à lista em `api/render-html.ts`.

3. **Performance**: A API route faz uma requisição para a Edge Function do Supabase a cada requisição de crawler. Isso pode adicionar latência, mas é necessário para garantir que as meta tags estejam sempre atualizadas.

## Próximos Passos

Para melhorar ainda mais a solução, considere:

1. **Cache na API Route**: Implementar cache na API route para reduzir chamadas à Edge Function
2. **Pre-rendering**: Usar um serviço de pre-rendering como Prerender.io ou similar
3. **SSR**: Migrar para um framework com SSR nativo (Next.js, Remix, etc.)


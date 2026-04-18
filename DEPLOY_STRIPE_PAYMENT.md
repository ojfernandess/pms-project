# 🚀 Deploy: Edge Function stripe-payment

## ⚠️ Erro: CORS Policy Blocked

Se você está recebendo erro **"blocked by CORS policy"** ou **"ERR_FAILED"** ao tentar criar um Payment Intent, significa que a Edge Function `stripe-payment` **não está deployada**.

## ✅ Solução: Deploy da Função

### Opção 1: Via Supabase CLI (Recomendado)

```bash
# 1. Instalar Supabase CLI (se ainda não tiver)
npm install -g supabase

# 2. Fazer login
supabase login

# 3. Linkar ao seu projeto
supabase link --project-ref SEU_PROJETO_ID
# Exemplo: supabase link --project-ref spccmzvizaobinccqpvn

# 4. Deploy da função
supabase functions deploy stripe-payment
```

**Onde encontrar o Project ID:**
- Supabase Dashboard > Settings > General > Reference ID
- Ou na URL: `https://app.supabase.com/project/SEU_PROJETO_ID`

### Opção 2: Via Supabase Dashboard

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Edge Functions** (menu lateral)
4. Clique em **"Deploy a new function"** ou **"Create function"**
5. Selecione a pasta `supabase/functions/stripe-payment`
6. Clique em **"Deploy"**

### Opção 3: Verificar se já está deployada

Teste a URL diretamente:

```bash
curl -X OPTIONS https://SEU_PROJETO.supabase.co/functions/v1/stripe-payment \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: POST"
```

Se retornar status 204, a função está deployada e CORS está funcionando.

## 🔧 Após o Deploy

1. **Teste a função:**
   ```bash
   curl https://SEU_PROJETO.supabase.co/functions/v1/stripe-payment
   ```

2. **Verifique os logs:**
   - No Supabase Dashboard > Edge Functions > stripe-payment > Logs
   - Verifique se há erros

3. **Teste criar uma reserva:**
   - Crie uma nova reserva com valor pendente
   - Verifique se o link de pagamento é gerado

## 🐛 Troubleshooting

### Erro CORS continua após deploy
- Verifique se a função está retornando os headers CORS corretos
- Verifique se o OPTIONS está retornando status 204
- Aguarde alguns minutos após o deploy

### Erro 401 "Missing authorization header" ⚠️ IMPORTANTE

Este erro ocorre porque o Supabase está exigindo autenticação, mas a função precisa permitir acesso anônimo.

#### Solução 1: Via Supabase Dashboard (Recomendado)

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Vá em **Edge Functions**
3. Clique na função `stripe-payment`
4. Vá em **Settings** ou **Configuration**
5. Desative a opção **"Require Authorization"** ou **"Verify JWT"**
6. Salve as alterações
7. Faça o deploy novamente (se necessário)

#### Solução 2: Via Supabase CLI (OBRIGATÓRIO)

**IMPORTANTE:** Você DEVE usar a flag `--no-verify-jwt` ao fazer o deploy:

```bash
supabase functions deploy stripe-payment --no-verify-jwt
```

**Se a função já está deployada, você precisa redeployar com a flag:**

```bash
# Redeploy com a flag para desabilitar JWT verification
supabase functions deploy stripe-payment --no-verify-jwt
```

**Verificar se está configurado corretamente:**

Após o deploy, teste sem autenticação:
```bash
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/stripe-payment \
  -H "Content-Type: application/json" \
  -d '{"test": "test"}'
```

Se retornar erro sobre campos obrigatórios (não 401), está funcionando! ✅
Se retornar 401, a função ainda está exigindo autenticação e precisa ser redeployada.

#### Solução 3: Arquivo de Configuração

O arquivo `.supabase-config.json` já foi criado na pasta da função com:
```json
{
  "verify_jwt": false,
  "allow_anonymous": true
}
```

Se ainda não funcionar, você pode precisar configurar manualmente no Dashboard.

**Nota:** A função usa Service Role Key internamente para acessar o banco de dados, então é seguro permitir acesso anônimo. A autenticação será feita internamente pela função.

### Erro 500 "Internal Server Error"
- Verifique os logs da Edge Function no Supabase Dashboard
- Verifique se as migrations foram aplicadas
- Verifique se as tabelas `stripe_*` existem
- Verifique se as chaves do Stripe estão configuradas

## 📝 Checklist

- [ ] Edge Function `stripe-payment` deployada
- [ ] CORS configurado corretamente (OPTIONS retorna 204)
- [ ] Chaves do Stripe configuradas (global e estabelecimento)
- [ ] Stripe habilitado globalmente
- [ ] Stripe habilitado no estabelecimento
- [ ] Teste de criação de Payment Intent funciona

## 🔍 Verificar Deploy

Após o deploy, você pode verificar se está funcionando:

1. **No Supabase Dashboard:**
   - Vá em Edge Functions
   - Verifique se `stripe-payment` aparece na lista
   - Clique para ver detalhes e logs

2. **Teste direto:**
   ```bash
   curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/stripe-payment \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer SEU_ANON_KEY" \
     -d '{
       "establishment_id": "SEU_ESTABLISHMENT_ID",
       "amount": 100,
       "currency": "BRL",
       "payment_type": "test"
     }'
   ```

Se retornar um erro sobre campos obrigatórios, a função está funcionando! ✅


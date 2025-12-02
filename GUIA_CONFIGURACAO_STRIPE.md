# 🎯 Guia Completo: Configuração do Stripe no PMS

Este guia explica como configurar a integração Stripe no PMS e usar as variáveis de pagamento nos templates de email.

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Configuração Inicial (Super Admin)](#configuração-inicial-super-admin)
3. [Configuração por Estabelecimento](#configuração-por-estabelecimento)
4. [Configuração de Webhooks](#configuração-de-webhooks)
5. [Variáveis no Template de Email](#variáveis-no-template-de-email)
6. [Testando a Integração](#testando-a-integração)
7. [Troubleshooting](#troubleshooting)

---

## 📦 Pré-requisitos

### 1. Aplicar Migrations

Certifique-se de que as seguintes migrations foram aplicadas no banco de dados:

- `20251120000037_create_stripe_integration.sql` - Estrutura do Stripe
- `20251120000038_fix_stripe_rls_policies.sql` - Correção de políticas RLS

### 2. Instalar Dependências

As dependências do Stripe já devem estar instaladas:

```bash
npm install @stripe/stripe-js@^2.4.0 @stripe/react-stripe-js@^2.9.0
```

### 3. Conta Stripe

- Crie uma conta no [Stripe](https://stripe.com)
- Acesse o [Dashboard do Stripe](https://dashboard.stripe.com)
- Obtenha suas chaves de API (Teste e Produção)

---

## 🔧 Configuração Inicial (Super Admin)

### Passo 1: Acessar Configuração Global

1. Faça login como **Super Admin**
2. Acesse: `/super-admin` ou `/admin-dashboard`
3. Clique na aba **"Stripe"**

### Passo 2: Configurar Chaves de Teste

1. No Stripe Dashboard, vá em **Developers > API keys**
2. Copie as chaves de **Test mode**:
   - **Publishable key**: `pk_test_...`
   - **Secret key**: `sk_test_...`

3. No PMS:
   - Marque **"Ativar Integração Stripe"**
   - Mantenha **"Modo de Teste"** ativado
   - Cole a **Chave Pública de Teste**
   - Cole a **Chave Secreta de Teste** (será ocultada)
   - Clique em **"Salvar Configuração"**

### Passo 3: Configurar Chaves de Produção (Opcional)

Quando estiver pronto para produção:

1. No Stripe Dashboard, ative o **Live mode**
2. Copie as chaves de produção:
   - **Publishable key**: `pk_live_...`
   - **Secret key**: `sk_live_...`

3. No PMS:
   - Desative **"Modo de Teste"**
   - Cole as chaves de produção
   - Clique em **"Salvar Configuração"**

### Passo 4: Configurar Webhook Secret (Ver seção específica abaixo)

---

## 🏢 Configuração por Estabelecimento

Após a configuração global estar ativa, cada estabelecimento pode configurar sua própria conta Stripe.

### Passo 1: Acessar Configurações do Estabelecimento

1. Faça login como usuário do estabelecimento
2. Acesse: `/:establishmentId/configuracoes`
3. Clique na aba **"Stripe"**

### Passo 2: Configurar Chaves do Estabelecimento

1. Se você tem uma conta Stripe Connect separada:
   - Cole suas próprias chaves de API
   - Configure webhook secret específico

2. Se você usa a mesma conta Stripe:
   - Pode deixar vazio (usará as chaves globais)
   - Ou configure chaves específicas para este estabelecimento

3. Marque **"Ativar Stripe para este Estabelecimento"**
4. Clique em **"Salvar Configuração"**

### Passo 3: Verificar Status

Após salvar, você verá:
- ✅ Status: **Ativo** ou **Inativo**
- Conta Stripe (se configurada)
- Customer ID (criado automaticamente na primeira transação)

---

## 🔔 Configuração de Webhooks

Os webhooks são **essenciais** para sincronizar pagamentos entre Stripe e o PMS.

### ⚠️ IMPORTANTE: Deploy da Edge Function

**Antes de configurar o webhook, você DEVE fazer o deploy da Edge Function `stripe-webhook`!**

#### Opção 1: Deploy via CLI do Supabase

```bash
# Instalar Supabase CLI (se ainda não tiver)
npm install -g supabase

# Fazer login
supabase login

# Linkar ao projeto (se ainda não tiver)
supabase link --project-ref SEU_PROJETO_ID

# Deploy da função
supabase functions deploy stripe-webhook
```

#### Opção 2: Deploy via Dashboard do Supabase

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Vá em **Edge Functions**
3. Clique em **"Deploy a new function"** ou **"Create function"**
4. Selecione a pasta `supabase/functions/stripe-webhook`
5. Clique em **"Deploy"**

#### Opção 3: Deploy via GitHub Actions (se configurado)

Se você tem CI/CD configurado, o deploy pode ser automático ao fazer push.

### Passo 1: Obter URL do Webhook

A URL do webhook é:
```
https://SEU_PROJETO.supabase.co/functions/v1/stripe-webhook
```

**Substitua `SEU_PROJETO` pelo ID do seu projeto Supabase.**

Você pode encontrar o ID do projeto em:
- Supabase Dashboard > Settings > General > Reference ID
- Ou na URL do seu projeto: `https://app.supabase.com/project/SEU_PROJETO`

**Exemplo:**
```
https://spccmzvizaobinccqpvn.supabase.co/functions/v1/stripe-webhook
```

### Passo 2: Verificar se a Função está Deployada

Antes de configurar no Stripe, teste a URL:

```bash
curl https://SEU_PROJETO.supabase.co/functions/v1/stripe-webhook
```

Se retornar algo diferente de 404, a função está deployada.

### Passo 3: Configurar no Stripe Dashboard

1. Acesse [Stripe Dashboard](https://dashboard.stripe.com)
2. Vá em **Developers > Webhooks**
3. Clique em **"Add endpoint"**
4. Cole a URL do webhook (use a URL completa do Passo 1)
5. Selecione os eventos:
   - ✅ `payment_intent.succeeded`
   - ✅ `payment_intent.payment_failed`
   - ✅ `charge.refunded`
   - ✅ `payment_method.attached`

6. Clique em **"Add endpoint"**
7. **Copie o "Signing secret"** (começa com `whsec_`) e salve na configuração global do Stripe no PMS

### Passo 3: Copiar Webhook Secret

1. Após criar o endpoint, clique nele
2. Na seção **"Signing secret"**, clique em **"Reveal"**
3. Copie o secret (começa com `whsec_...`)

### Passo 4: Configurar no PMS

**Para Super Admin (Global):**
- Vá em `/super-admin` > Aba **"Stripe"**
- Cole o **Webhook Secret de Teste** (se estiver em modo teste)
- Cole o **Webhook Secret de Produção** (se estiver em modo produção)
- Salve

**Para Estabelecimento:**
- Vá em `/:establishmentId/configuracoes` > Aba **"Stripe"**
- Cole o **Webhook Secret** específico (se usar conta separada)
- Salve

### Passo 5: Testar Webhook

1. No Stripe Dashboard, vá em **Developers > Webhooks**
2. Clique no seu endpoint
3. Clique em **"Send test webhook"**
4. Selecione um evento (ex: `payment_intent.succeeded`)
5. Clique em **"Send test webhook"**
6. Verifique se aparece como **"Succeeded"**

---

## 📧 Variáveis no Template de Email

### Variável de Link de Pagamento

A variável `{{payment_link}}` está disponível no template de **"Reserva Criada"**.

#### Como Funciona

- O link é gerado **automaticamente** quando:
  - A reserva não está totalmente paga
  - O Stripe está ativado globalmente
  - O Stripe está ativado para o estabelecimento

- Se a reserva já está paga, a variável será **vazia**

#### Como Usar no Template

**Exemplo Básico:**
```html
{{#if payment_link}}
  <p>
    <a href="{{payment_link}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
      Clique aqui para pagar sua reserva
    </a>
  </p>
{{/if}}
```

**Exemplo Completo:**
```html
{{#if payment_link}}
  <div style="margin: 20px 0; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
    <h3 style="color: #333; margin-bottom: 10px;">💳 Pagamento Pendente</h3>
    <p style="color: #666; margin-bottom: 15px;">
      Sua reserva foi criada com sucesso! Para confirmar, realize o pagamento clicando no botão abaixo:
    </p>
    <a href="{{payment_link}}" 
       style="background-color: #28a745; 
              color: white; 
              padding: 12px 30px; 
              text-decoration: none; 
              border-radius: 5px; 
              display: inline-block;
              font-weight: bold;">
      Pagar Agora - R$ {{total_amount}}
    </a>
    <p style="color: #999; font-size: 12px; margin-top: 10px;">
      Este link é válido por tempo indeterminado. Você pode pagar a qualquer momento.
    </p>
  </div>
{{/if}}
```

**Exemplo com Condicional:**
```html
{{#if payment_link}}
  <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0; font-weight: bold; color: #856404;">
      ⚠️ Atenção: Pagamento Pendente
    </p>
    <p style="margin: 0 0 15px 0; color: #856404;">
      Valor pendente: <strong>R$ {{total_amount}}</strong>
    </p>
    <a href="{{payment_link}}" style="background-color: #ffc107; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
      Realizar Pagamento
    </a>
  </div>
{{else}}
  <p style="color: #28a745; font-weight: bold;">
    ✅ Reserva confirmada e paga!
  </p>
{{/if}}
```

### Outras Variáveis Disponíveis

Além de `{{payment_link}}`, você pode usar:

- `{{total_amount}}` - Valor total da reserva
- `{{paid_amount}}` - Valor já pago
- `{{payment_status}}` - Status do pagamento (Pendente, Parcial, Pago, Reembolsado)
- `{{reservation_code}}` - Código da reserva
- `{{guest_name}}` - Nome do hóspede
- `{{checkin_date}}` - Data de check-in
- `{{checkout_date}}` - Data de check-out

### Exemplo de Template Completo

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Reserva Criada - {{reservation_code}}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #007bff;">Reserva Criada com Sucesso!</h1>
    
    <p>Olá <strong>{{guest_name}}</strong>,</p>
    
    <p>Sua reserva <strong>{{reservation_code}}</strong> foi criada com sucesso!</p>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h3 style="margin-top: 0;">Detalhes da Reserva</h3>
      <p><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</p>
      <p><strong>Check-out:</strong> {{checkout_date}} às {{checkout_time}}</p>
      <p><strong>Valor Total:</strong> R$ {{total_amount}}</p>
      <p><strong>Status do Pagamento:</strong> {{payment_status}}</p>
    </div>

    {{#if payment_link}}
      <div style="background-color: #fff3cd; border: 2px solid #ffc107; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <h2 style="color: #856404; margin-top: 0;">💳 Pagamento Pendente</h2>
        <p style="color: #856404; margin-bottom: 20px;">
          Para confirmar sua reserva, realize o pagamento de <strong>R$ {{total_amount}}</strong>
        </p>
        <a href="{{payment_link}}" 
           style="background-color: #28a745; 
                  color: white; 
                  padding: 15px 40px; 
                  text-decoration: none; 
                  border-radius: 5px; 
                  display: inline-block;
                  font-size: 16px;
                  font-weight: bold;">
          Pagar Agora
        </a>
        <p style="color: #856404; font-size: 12px; margin-top: 15px;">
          Este link é seguro e válido por tempo indeterminado.
        </p>
      </div>
    {{else}}
      <div style="background-color: #d4edda; border: 2px solid #28a745; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="color: #155724; margin: 0; font-weight: bold;">
          ✅ Pagamento confirmado! Sua reserva está garantida.
        </p>
      </div>
    {{/if}}

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
      <p style="color: #666; font-size: 14px;">
        <strong>Hotel:</strong> {{hotel_name}}<br>
        <strong>Endereço:</strong> {{hotel_address}}<br>
        <strong>Contato:</strong> {{hotel_contact}}
      </p>
      
      {{#if web_checkin_link}}
        <p style="margin-top: 15px;">
          <a href="{{web_checkin_link}}" style="color: #007bff; text-decoration: none;">
            📱 Fazer Check-in Online
          </a>
        </p>
      {{/if}}
    </div>
  </div>
</body>
</html>
```

---

## 🧪 Testando a Integração

### Cartões de Teste do Stripe

Use estes cartões para testar pagamentos:

| Cenário | Número do Cartão | CVV | Data |
|---------|-----------------|-----|------|
| **Sucesso** | `4242 4242 4242 4242` | Qualquer 3 dígitos | Qualquer data futura |
| **Falha** | `4000 0000 0000 0002` | Qualquer 3 dígitos | Qualquer data futura |
| **3D Secure** | `4000 0025 0000 3155` | Qualquer 3 dígitos | Qualquer data futura |
| **Requer Autenticação** | `4000 0027 6000 3184` | Qualquer 3 dígitos | Qualquer data futura |

### Fluxo de Teste

1. **Criar Reserva sem Pagamento**
   - Crie uma reserva normalmente
   - Não marque como paga
   - Verifique se o email contém o link de pagamento

2. **Testar Link de Pagamento**
   - Clique no link no email
   - Use cartão de teste: `4242 4242 4242 4242`
   - Complete o pagamento
   - Verifique se a reserva foi atualizada

3. **Testar Extensão de Reserva**
   - No guest-dashboard, clique em "Estender Reserva"
   - Selecione noites adicionais
   - Realize o pagamento
   - Verifique se a data de checkout foi atualizada

4. **Testar Webhooks**
   - No Stripe Dashboard, envie um webhook de teste
   - Verifique se aparece na tabela `stripe_webhooks`
   - Verifique se o status foi atualizado corretamente

---

## 🔍 Troubleshooting

### Erro 406 (Not Acceptable)

**Causa:** Política RLS bloqueando acesso ou tabela sem registros.

**Solução:**
- Execute a migration `20251120000038_fix_stripe_rls_policies.sql`
- Verifique se o usuário está autenticado
- Verifique se a tabela foi criada corretamente

### Link de Pagamento Não Aparece no Email

**Causas Possíveis:**
1. Stripe não está ativado globalmente
2. Stripe não está ativado para o estabelecimento
3. Reserva já está paga
4. Template não tem a variável `{{payment_link}}`

**Solução:**
1. Verifique configuração global em `/super-admin` > Stripe
2. Verifique configuração do estabelecimento em `/:establishmentId/configuracoes` > Stripe
3. Verifique se a reserva tem pagamento pendente
4. Adicione `{{#if payment_link}}...{{/if}}` no template

### Webhook Não Está Funcionando

**Verificações:**
1. URL do webhook está correta?
2. Webhook secret está configurado?
3. Eventos estão selecionados no Stripe Dashboard?
4. Edge Function `stripe-webhook` está deployada?

**Solução:**
1. Verifique a URL no Stripe Dashboard
2. Copie o webhook secret corretamente
3. Selecione todos os eventos necessários
4. Deploy da Edge Function no Supabase Dashboard

### Pagamento Não Atualiza Status da Reserva

**Causa:** Webhook não está processando corretamente.

**Solução:**
1. Verifique logs da Edge Function no Supabase Dashboard
2. Verifique se o webhook está sendo recebido (tabela `stripe_webhooks`)
3. Verifique se há erros no processamento

### Erro ao Criar Payment Intent

**Causas Possíveis:**
1. Chaves do Stripe incorretas
2. Estabelecimento não configurado
3. Edge Function não deployada

**Solução:**
1. Verifique se as chaves estão corretas
2. Verifique se o estabelecimento tem Stripe ativado
3. Deploy da Edge Function `stripe-payment` no Supabase Dashboard

---

## 📝 Checklist de Configuração

### Super Admin
- [ ] Migration aplicada
- [ ] Stripe ativado globalmente
- [ ] Chaves de teste configuradas
- [ ] Webhook configurado no Stripe Dashboard
- [ ] Webhook secret configurado no PMS
- [ ] Edge Functions deployadas

### Estabelecimento
- [ ] Stripe ativado para o estabelecimento
- [ ] Chaves configuradas (se usar conta separada)
- [ ] Webhook secret configurado (se usar conta separada)

### Template de Email
- [ ] Variável `{{payment_link}}` adicionada ao template
- [ ] Condicional `{{#if payment_link}}` implementada
- [ ] Estilo do botão de pagamento configurado
- [ ] Template testado com reserva sem pagamento

---

## 🔐 Segurança

### Boas Práticas

1. **Nunca exponha chaves secretas no frontend**
   - As chaves secretas são usadas apenas nas Edge Functions
   - O frontend usa apenas a chave pública

2. **Use HTTPS em produção**
   - Sempre use HTTPS para links de pagamento
   - Stripe requer HTTPS para produção

3. **Valide webhooks**
   - Sempre valide a assinatura do webhook
   - Use o webhook secret para verificação

4. **Monitore transações**
   - Verifique regularmente os pagamentos
   - Monitore webhooks para detectar problemas

---

## 📞 Suporte

Para problemas ou dúvidas:

1. **Logs do Supabase:** Verifique logs das Edge Functions
2. **Stripe Dashboard:** Verifique eventos e webhooks
3. **Console do Navegador:** Verifique erros JavaScript
4. **Documentação Stripe:** https://stripe.com/docs

---

## 🎉 Pronto!

Após seguir este guia, sua integração Stripe estará configurada e funcionando. Os hóspedes poderão:

- ✅ Receber links de pagamento por email
- ✅ Pagar reservas online
- ✅ Estender reservas com pagamento
- ✅ Pagar taxas adicionais
- ✅ Salvar cartões para cobranças futuras


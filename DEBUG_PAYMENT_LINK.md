# 🐛 Debug: Link de Pagamento não está sendo enviado no Email

## Problema
Ao criar uma reserva, o email não contém o link de pagamento, mesmo com Stripe configurado.

## Checklist de Verificação

### 1. ✅ Verificar se Stripe está habilitado

**Super Admin:**
- Vá em `/super-admin` > Aba **"Stripe"**
- Verifique se **"Stripe Habilitado"** está ativado
- Verifique se as chaves estão configuradas

**Estabelecimento:**
- Vá em `/:establishmentId/configuracoes` > Aba **"Stripe"**
- Verifique se **"Stripe Habilitado"** está ativado para o estabelecimento
- Verifique se as chaves estão configuradas

### 2. ✅ Verificar se a reserva tem valor pendente

O link só é gerado se:
- `total_amount > 0`
- `paid_amount < total_amount`
- `payment_status` é `pending` ou `partial`

### 3. ✅ Verificar se a Edge Function está deployada

A Edge Function `stripe-payment` precisa estar deployada:

```bash
supabase functions deploy stripe-payment
```

Teste se está funcionando:
```bash
curl https://SEU_PROJETO.supabase.co/functions/v1/stripe-payment
```

### 4. ✅ Verificar logs no Console do Navegador

Ao criar uma reserva, abra o Console do Navegador (F12) e procure por logs que começam com `[Stripe]`:

- `[Stripe] Verificando necessidade de pagamento:` - Mostra os valores
- `[Stripe] Pagamento necessário:` - Confirma que precisa de pagamento
- `[Stripe] ✅ Link de pagamento gerado com sucesso:` - Link foi gerado
- `[Stripe] 🔗 Payment Link final:` - Link final que será usado

Se aparecer `(vazio - não será incluído no email)`, significa que o link não foi gerado.

### 5. ✅ Verificar se o template de email usa a variável

O template de email deve conter:

```html
{{#if payment_link}}
  <a href="{{payment_link}}">Pagar Agora</a>
{{/if}}
```

**Importante:** Se `payment_link` for uma string vazia (`''`), o bloco `{{#if payment_link}}` **não será renderizado**.

### 6. ✅ Verificar logs no emailService

Procure por logs no console:
- `✅ Payment link disponível nas variáveis:` - Link está disponível
- `⚠️ Payment link NÃO está disponível nas variáveis do template` - Link não foi gerado

## Possíveis Causas

### Causa 1: Edge Function não está deployada
**Solução:** Deploy da função `stripe-payment`

### Causa 2: Erro ao criar Payment Intent
**Solução:** Verifique os logs do console para ver o erro específico

### Causa 3: Stripe não está habilitado
**Solução:** Configure no Super Admin e no Estabelecimento

### Causa 4: Reserva já está paga
**Solução:** O link só é gerado se houver valor pendente

### Causa 5: Guest/Client ID não encontrado
**Solução:** Verifique se a reserva tem `guest_id` ou `client_id`

### Causa 6: Template não usa a variável
**Solução:** Adicione `{{#if payment_link}}...{{/if}}` no template

## Como Testar

1. **Criar uma reserva de teste:**
   - Com `total_amount > 0`
   - Com `paid_amount = 0` ou `paid_amount < total_amount`
   - Com `payment_status = 'pending'`

2. **Verificar logs no console:**
   - Abra o Console do Navegador (F12)
   - Procure por logs `[Stripe]`

3. **Verificar se o email foi enviado:**
   - Verifique a fila de emails
   - Verifique se o email chegou na caixa de entrada

4. **Verificar o conteúdo do email:**
   - Abra o email recebido
   - Verifique se contém o link de pagamento
   - Se não contém, verifique os logs para ver por que o link não foi gerado

## Exemplo de Logs Esperados

```
[Stripe] Verificando necessidade de pagamento: {
  reservation_id: "...",
  establishment_id: "...",
  payment_status: "pending",
  total_amount: 100,
  paid_amount: 0,
  pending_amount: 100
}
[Stripe] Pagamento necessário: { pendingAmount: 100 }
[Stripe] ✅ Link de pagamento gerado com sucesso: https://app.vivakey.com.br/payment/pi_xxx
[Stripe] 🔗 Payment Link final: https://app.vivakey.com.br/payment/pi_xxx
✅ Payment link disponível nas variáveis: https://app.vivakey.com.br/payment/pi_xxx
```

## Se o problema persistir

1. Compartilhe os logs do console
2. Verifique se a Edge Function `stripe-payment` está deployada
3. Verifique se as chaves do Stripe estão corretas
4. Verifique se o template de email está usando `{{#if payment_link}}`


# 🎯 Guia de Integração Stripe - PMS

## ✅ Implementação Completa

### 1. Estrutura do Banco de Dados
- ✅ Tabela `stripe_global_config` - Configuração global (Super Admin)
- ✅ Tabela `stripe_establishment_config` - Configuração por estabelecimento
- ✅ Tabela `stripe_payment_methods` - Métodos de pagamento salvos
- ✅ Tabela `stripe_payments` - Transações e pagamentos
- ✅ Tabela `stripe_refunds` - Reembolsos
- ✅ Tabela `stripe_webhooks` - Webhooks recebidos

### 2. Hooks e Componentes
- ✅ `useStripe` - Hook para gerenciar integração Stripe
- ✅ `StripeGlobalConfigDialog` - Configuração global (Super Admin)
- ✅ `StripeEstablishmentConfigDialog` - Configuração por estabelecimento
- ✅ `StripeProvider` - Provider do Stripe Elements
- ✅ `PaymentDialog` - Diálogo de pagamento
- ✅ `ExtendReservationDialog` - Extensão de reserva com pagamento
- ✅ `stripePaymentLink.ts` - Funções para gerar links de pagamento

### 3. Edge Functions
- ✅ `stripe-payment` - Processar pagamentos
- ✅ `stripe-webhook` - Receber e processar webhooks
- ✅ `stripe-refund` - Processar reembolsos

## 📋 Próximos Passos

### 1. Instalar Dependências
```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

### 2. Configurar Chaves do Stripe

#### Super Admin:
1. Acesse a área de administração
2. Vá em Configurações > Stripe
3. Configure as chaves de teste:
   - Chave Pública: `pk_test_51SW4l6G70nwUgqCaIv498GqlXJ8Dhk9QwjGXVv6Vi1KYvmVz6hZYkaL8JcrOf4jaOTZVHuQfK7U8QgqWV6vddfWp00LongoDVY`
   - Chave Secreta: `sk_test_51SW4l6G70nwUgqCaPiPKQAY0k6TC5MX3h9cshoadUk6TCnWgZ4wcjT2uAWoqem1yvVVbdDm42psYqJ5oEYnxwBhj00He8AYpel`
4. Ative a integração

#### Estabelecimentos:
1. Cada estabelecimento pode configurar suas próprias chaves
2. Acesse Configurações > Integrações > Stripe
3. Configure suas chaves (teste ou produção)

### 3. Configurar Webhooks no Stripe Dashboard

1. Acesse [Stripe Dashboard](https://dashboard.stripe.com)
2. Vá em Developers > Webhooks
3. Adicione endpoint: `https://seu-projeto.supabase.co/functions/v1/stripe-webhook`
4. Selecione eventos:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `payment_method.attached`
5. Copie o Webhook Secret e adicione na configuração

### 4. Implementar no Guest Dashboard

Adicione o componente de extensão de reserva:

```tsx
import { ExtendReservationDialog } from "@/components/stripe/ExtendReservationDialog";

// No componente de reserva
<ExtendReservationDialog
  open={extendDialogOpen}
  onOpenChange={setExtendDialogOpen}
  reservationId={reservation.id}
  currentCheckout={new Date(reservation.checkout_date)}
  dailyRate={reservation.total_price / reservation.nights}
  onSuccess={() => {
    // Atualizar dados da reserva
    refetch();
  }}
/>
```

### 5. Adicionar Link de Pagamento no Template de Email

No template de "Reserva Criada", adicione:

```tsx
import { generatePaymentLink } from "@/lib/stripePaymentLink";

// Gerar link
const paymentLink = await generatePaymentLink(
  reservation.id,
  reservation.total_price,
  `Pagamento da reserva #${reservation.id}`
);

// No template HTML
<a href="${paymentLink}">Clique aqui para pagar sua reserva</a>
```

### 6. Criar Página de Pagamento

Crie `src/pages/PaymentPage.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { StripeProvider } from "@/components/stripe/StripeProvider";
import { PaymentDialog } from "@/components/stripe/PaymentDialog";

export const PaymentPage = () => {
  const { paymentIntentId } = useParams();
  // Buscar dados do pagamento e exibir PaymentDialog
  // ...
};
```

### 7. Implementar Pagamento de Taxas Adicionais

No componente de adicionar taxas:

```tsx
import { PaymentDialog } from "@/components/stripe/PaymentDialog";

// Quando adicionar taxa
<PaymentDialog
  open={paymentOpen}
  onOpenChange={setPaymentOpen}
  amount={feeAmount}
  paymentType="additional_fee"
  reservationId={reservationId}
  description={`Taxa: ${feeDescription}`}
  onSuccess={() => {
    // Atualizar reserva
  }}
/>
```

### 8. Implementar Salvamento de Cartão

No `PaymentDialog`, quando `savePaymentMethod={true}`:

```tsx
<PaymentDialog
  // ... outras props
  savePaymentMethod={true}
  onSuccess={() => {
    // Cartão será salvo automaticamente
  }}
/>
```

### 9. Implementar Reembolsos

No componente de gerenciamento de pagamentos:

```tsx
import { useStripe } from "@/hooks/useStripe";

const { createRefund } = useStripe();

// Processar reembolso
await createRefund({
  paymentId: payment.id,
  amount: refundAmount,
  reason: "requested_by_customer",
  description: "Reembolso solicitado pelo cliente",
});
```

## 🔒 Segurança

### Boas Práticas Implementadas:
- ✅ Chaves secretas nunca expostas no frontend
- ✅ Todas as operações sensíveis via Edge Functions
- ✅ Validação de webhooks com assinatura
- ✅ RLS (Row Level Security) em todas as tabelas
- ✅ Dados de cartão nunca armazenados (apenas tokens do Stripe)

### Recomendações:
- Use HTTPS em produção
- Mantenha as chaves secretas seguras
- Monitore webhooks para detectar problemas
- Use modo de teste durante desenvolvimento

## 📝 Notas Importantes

1. **Modo de Teste**: Por padrão, o sistema está em modo de teste. Altere para produção quando estiver pronto.

2. **Webhooks**: Essenciais para sincronização. Sempre configure os webhooks no Stripe Dashboard.

3. **Customer ID**: O sistema cria automaticamente um customer no Stripe para cada hóspede na primeira compra.

4. **Métodos de Pagamento**: Cartões são salvos como Payment Methods do Stripe, nunca armazenamos dados sensíveis.

5. **Reembolsos**: Podem ser totais ou parciais. O status do pagamento é atualizado automaticamente.

## 🚀 Testando

### Cartões de Teste:
- Sucesso: `4242 4242 4242 4242`
- Falha: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### Códigos de Teste:
- CVV: Qualquer 3 dígitos
- Data: Qualquer data futura
- CEP: Qualquer CEP válido

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs das Edge Functions no Supabase Dashboard
2. Verifique os webhooks no Stripe Dashboard
3. Consulte a documentação do Stripe: https://stripe.com/docs


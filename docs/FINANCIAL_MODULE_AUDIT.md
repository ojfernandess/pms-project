# Auditoria e Plano de Evolução - Módulo Financeiro

**Data:** 2025-01-26  
**Status:** 🔄 Em Análise e Evolução

---

## 📊 Estado Atual do Sistema

### ✅ O que já existe

#### 1. Estrutura Base
- ✅ Tabela `payments` - Pagamentos básicos
- ✅ Tabela `reservations` - Com campos financeiros (`total_amount`, `paid_amount`, `payment_status`)
- ✅ Tabela `stripe_payments` - Integração Stripe
- ✅ Tabela `payment_carriers` - Portadores de pagamento
- ✅ Tabela `payment_types` - Tipos de pagamento
- ✅ Tabela `service_fees` - Taxas de serviço
- ✅ Campos de cancelamento em `reservations` (`cancellation_penalty`, `cancellation_policy_applied`)

#### 2. Funcionalidades Implementadas
- ✅ Relatórios básicos de receita (faturamento, recebido, pendente)
- ✅ Gráficos de receita diária, métodos de pagamento, canais
- ✅ Exportação CSV/XLSX de faturamento e pagamentos
- ✅ Gestão de portadores e tipos de pagamento
- ✅ Taxas de serviço
- ✅ Integração Stripe (pagamentos, reembolsos)
- ✅ Sistema de multas de cancelamento (cálculo)
- ✅ Sistema de no-show (cálculo e detecção)

#### 3. Integrações
- ✅ Stripe (pagamentos online)
- ✅ Reservas (cálculo de valores)
- ✅ Políticas de cancelamento (cálculo de multas)

---

## ❌ O que falta implementar

### 1. Contas a Receber (Receivables)
**Status:** ⚠️ Parcial - Existe em `reservations` mas não estruturado

**Necessário:**
- Tabela dedicada `accounts_receivable`
- Geração automática a partir de:
  - Reservas confirmadas
  - Pré-pagamentos
  - Multas de cancelamento
  - Multas de no-show
  - Consumos extras
- Status: `pending`, `paid`, `overdue`, `partial`
- Vencimentos automáticos
- Alertas de inadimplência

### 2. Contas a Pagar (Payables)
**Status:** ❌ Não existe

**Necessário:**
- Tabela `accounts_payable`
- Gestão de fornecedores
- Comissões OTA (Booking, Airbnb, Expedia)
- Taxas de gateway (Stripe, etc.)
- Despesas operacionais
- Parcelamento e recorrência
- Centro de custo

### 3. Conciliação Bancária
**Status:** ❌ Não existe

**Necessário:**
- Importação automática (OFX, CNAB, CSV)
- API bancária (futuro)
- Regras de matching:
  - Por valor
  - Por data
  - Por nome hóspede
  - Por ID reserva
  - Por últimos 4 dígitos cartão
- Status: `auto_matched`, `manual_matched`, `divergent`
- Dashboard de divergências

### 4. Caixa / Fluxo Diário
**Status:** ❌ Não existe

**Necessário:**
- Interface estilo PDV
- Entradas do dia
- Saídas do dia
- Estornos
- Sangrias
- Filtros: turno, usuário, unidade
- Fechamento de caixa

### 5. Faturas / Invoices
**Status:** ⚠️ Parcial - Existe `fiscal_document_requests` mas não estruturado

**Necessário:**
- Tabela `invoices` estruturada
- Numeração sequencial
- Tipos: `reservation`, `penalty`, `service`, `refund`
- Status: `draft`, `issued`, `paid`, `cancelled`
- Geração automática
- Envio por email/WhatsApp

### 6. Multas Automáticas - Integração Completa
**Status:** ⚠️ Parcial - Cálculo existe, mas integração financeira incompleta

**Necessário:**
- Geração automática de `accounts_receivable` para multas
- Geração automática de `invoices` para multas
- Cobrança automática via gateway
- Notificações ao hóspede
- Relatórios de receita recuperada

### 7. Relatórios Especializados
**Status:** ⚠️ Parcial - Relatórios básicos existem

**Faltando:**
- Relatório de Cancelamentos (valor perdido vs recuperado)
- Relatório de No-Show (receita prevista vs recuperada)
- Relatório de Penalidades
- Forecast Financeiro
- ADR / RevPAR
- Receita líquida vs bruta

### 8. Automação para Hotel Digital
**Status:** ⚠️ Parcial

**Faltando:**
- Cobrança automática pré-check-in
- Bloqueio check-in sem pagamento
- Envio link WhatsApp automático
- Recibo automático

### 9. Auditoria Financeira
**Status:** ❌ Não existe

**Necessário:**
- Tabela `financial_audit_logs`
- Registrar: quem lançou, quem estornou, quem alterou valor
- Perfis financeiros
- Aprovação de estornos

### 10. API Financeira
**Status:** ❌ Não existe

**Necessário:**
- Endpoints REST
- Webhooks
- Documentação

---

## 🎯 Plano de Implementação

### Fase 1: Fundação (Prioridade ALTA)
1. ✅ Criar migrations para estrutura base
2. ✅ Implementar Contas a Receber
3. ✅ Integrar multas automáticas
4. ✅ Criar relatórios de cancelamentos/no-show

### Fase 2: Operação (Prioridade ALTA)
1. ✅ Implementar Caixa/Fluxo Diário
2. ✅ Criar sistema de Faturas
3. ✅ Implementar Contas a Pagar básico

### Fase 3: Automação (Prioridade MÉDIA)
1. ✅ Conciliação Bancária
2. ✅ Automação hotel digital
3. ✅ Forecast Financeiro

### Fase 4: Avançado (Prioridade BAIXA)
1. ✅ API Financeira
2. ✅ Auditoria completa
3. ✅ Integrações avançadas

---

## 📋 Próximos Passos Imediatos

1. **Criar migrations** para estrutura financeira completa
2. **Implementar Contas a Receber** com geração automática
3. **Integrar multas** com sistema financeiro
4. **Criar relatórios** especializados

---

**Última atualização:** 2025-01-26


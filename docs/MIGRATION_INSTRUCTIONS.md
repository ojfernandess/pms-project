# Instruções de Migração - Módulo Financeiro

**Data:** 2025-01-26

---

## ⚠️ IMPORTANTE: Ordem de Execução das Migrations

Execute as migrations na seguinte ordem no Supabase:

### 1. Estrutura Base
```
20250126000001_create_financial_module_base.sql
```
**Cria:** Contas a Receber, Contas a Pagar, Faturas, Conciliação Bancária, Caixa, Auditoria

### 2. Triggers Automáticos
```
20250126000002_auto_create_receivables_from_reservations.sql
```
**Cria:** Triggers para gerar contas a receber automaticamente

### 3. Contas Bancárias
```
20250126000003_create_bank_accounts.sql
```
**Cria:** Tabela `bank_accounts` para cadastro de contas bancárias

### 4. Estornos
```
20250126000004_create_refunds_table.sql
```
**Cria:** Tabela `financial_refunds` para gerenciar estornos

### 5. Foreign Key (Opcional)
```
20250126000005_add_bank_account_fk.sql
```
**Adiciona:** Foreign Key de `bank_account_id` em `bank_reconciliation`

---

## 🔧 Como Aplicar as Migrations

### Opção 1: Via Supabase Dashboard

1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Cole o conteúdo de cada migration
4. Execute na ordem listada acima

### Opção 2: Via CLI do Supabase

```bash
# Aplicar todas as migrations
supabase db push

# Ou aplicar uma por uma
supabase migration up
```

---

## ✅ Verificação Pós-Migração

Após aplicar as migrations, verifique se as tabelas foram criadas:

```sql
-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'accounts_receivable',
  'accounts_payable',
  'invoices',
  'bank_reconciliation',
  'bank_accounts',
  'financial_refunds',
  'daily_cash_flow',
  'cash_flow_transactions',
  'financial_audit_logs'
)
ORDER BY table_name;
```

---

## 🐛 Troubleshooting

### Erro: "Could not find the table 'public.bank_accounts'"

**Causa:** A migration `20250126000003_create_bank_accounts.sql` não foi executada.

**Solução:** Execute a migration `20250126000003_create_bank_accounts.sql` no Supabase.

### Erro: "relation 'user_establishments' does not exist"

**Causa:** A migration base está tentando usar uma tabela que não existe.

**Solução:** Já corrigido na migration. A função `user_can_access_establishment` é criada automaticamente.

### Erro: "foreign key constraint fails"

**Causa:** A tabela `bank_accounts` não existe quando `bank_reconciliation` tenta referenciá-la.

**Solução:** Execute primeiro `20250126000003_create_bank_accounts.sql`, depois `20250126000005_add_bank_account_fk.sql`.

---

## 📋 Checklist de Migrations

- [ ] `20250126000001_create_financial_module_base.sql`
- [ ] `20250126000002_auto_create_receivables_from_reservations.sql`
- [ ] `20250126000003_create_bank_accounts.sql` ⚠️ **OBRIGATÓRIA para Conciliação**
- [ ] `20250126000004_create_refunds_table.sql`
- [ ] `20250126000005_add_bank_account_fk.sql` (opcional, mas recomendado)

---

**Última atualização:** 2025-01-26


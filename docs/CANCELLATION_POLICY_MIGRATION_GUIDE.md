# Guia de Aplicação de Migrations - Políticas de Cancelamento

## ⚠️ Erro: Função RPC não encontrada

Se você está vendo o erro:
```
Could not find the function public.process_no_shows(p_establishment_id) in the schema cache
```

**Isso é normal!** O sistema está funcionando corretamente com fallback automático.

---

## 🔧 Solução: Aplicar Migrations

### Passo 1: Acessar Supabase SQL Editor

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor** no menu lateral

### Passo 2: Aplicar Migrations na Ordem

Execute cada migration abaixo, **na ordem**, copiando e colando o conteúdo completo:

#### Migration 1: Campos de Cancelamento
**Arquivo:** `supabase/migrations/20251225000015_add_cancellation_fields_to_reservations.sql`

```sql
-- Copiar conteúdo completo do arquivo
```

#### Migration 2: Função RPC para No-Shows
**Arquivo:** `supabase/migrations/20251225000016_create_no_show_processor_function.sql`

```sql
-- Copiar conteúdo completo do arquivo
```

#### Migration 3: Tabela de Aceites
**Arquivo:** `supabase/migrations/20251225000017_add_policy_acceptance.sql`

```sql
-- Copiar conteúdo completo do arquivo
```

### Passo 3: Verificar Aplicação

Após aplicar cada migration, verifique:

1. **Tabela `cancellation_logs` existe:**
   ```sql
   SELECT * FROM information_schema.tables 
   WHERE table_name = 'cancellation_logs';
   ```

2. **Função `process_no_shows` existe:**
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_name = 'process_no_shows';
   ```

3. **Tabela `cancellation_policy_acceptances` existe:**
   ```sql
   SELECT * FROM information_schema.tables 
   WHERE table_name = 'cancellation_policy_acceptances';
   ```

4. **Campos em `reservations`:**
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'reservations' 
   AND column_name IN (
     'cancellation_penalty',
     'cancellation_policy_applied',
     'cancellation_reason',
     'cancelled_at',
     'no_show_at',
     'cancellation_calculation_details'
   );
   ```

---

## ✅ Comportamento Atual (Sem Migrations)

**O sistema funciona normalmente!** Mesmo sem as migrations aplicadas:

- ✅ Cálculo de multas funciona
- ✅ Cancelamento funciona
- ✅ No-shows são processados (via método via serviço)
- ⚠️ Logs de auditoria não são salvos (tabela não existe)
- ⚠️ Aceite do hóspede não é registrado (tabela não existe)
- ⚠️ Função RPC não disponível (usa método mais lento)

**Recomendação:** Aplicar migrations para funcionalidade completa.

---

## 🚀 Após Aplicar Migrations

Após aplicar as migrations:

1. ✅ Erro de RPC desaparece
2. ✅ Logs de auditoria são salvos
3. ✅ Aceites são registrados
4. ✅ Processamento de no-shows mais rápido
5. ✅ Funcionalidade 100% completa

---

## 📝 Notas Importantes

1. **Ordem Importante:** Aplicar migrations na ordem (1, 2, 3)
2. **Backup:** Fazer backup do banco antes de aplicar migrations
3. **Teste:** Testar em ambiente de desenvolvimento primeiro
4. **Rollback:** Migrations podem ser revertidas se necessário

---

## 🔍 Troubleshooting

### Erro: "relation already exists"
- A migration já foi aplicada anteriormente
- Pode ignorar ou comentar a linha que cria a tabela

### Erro: "column already exists"
- O campo já existe na tabela
- Pode ignorar ou usar `IF NOT EXISTS`

### Erro: "function already exists"
- A função já foi criada
- Pode ignorar ou usar `CREATE OR REPLACE FUNCTION`

---

**Status:** ⚠️ Sistema funciona com fallback | ✅ Aplicar migrations para funcionalidade completa


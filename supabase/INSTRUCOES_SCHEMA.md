# 📋 Instruções para Executar o Schema

## ⚠️ IMPORTANTE

O arquivo `20251112000002_complete_schema.sql` contém **TODO o schema completo** do banco de dados de forma idempotente (pode ser executado múltiplas vezes sem erros).

## 🚀 Como Executar

### Opção 1: Via Supabase Dashboard (Recomendado)

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Clique em **New Query**
5. Copie e cole o conteúdo do arquivo `20251112000002_complete_schema.sql`
6. Clique em **Run** ou pressione `Ctrl+Enter`

### Opção 2: Via Supabase CLI

```bash
# Se você tem o Supabase CLI instalado
supabase db reset
# ou
supabase migration up
```

### Opção 3: Executar Apenas o Schema Completo

Se você já tem dados no banco e quer apenas garantir que o schema está correto:

1. Execute apenas o arquivo `20251112000002_complete_schema.sql`
2. Ele verifica se os tipos/tabelas existem antes de criar
3. Não vai apagar dados existentes

## 📝 O que o Schema Cria

### Tabelas Principais:
- ✅ `room_categories` - Categorias de quartos
- ✅ `rooms` - Quartos individuais
- ✅ `clients` - Clientes/hóspedes
- ✅ `reservations` - Reservas
- ✅ `payments` - Pagamentos
- ✅ `maintenance_tickets` - Tickets de manutenção

### Tabelas de Tarifário:
- ✅ `pricing_seasons` - Temporadas
- ✅ `pricing_rules` - Regras de precificação
- ✅ `promotions` - Promoções e descontos

### Tabelas de Channel Manager:
- ✅ `ota_channels` - Canais OTA configurados
- ✅ `ota_reservations` - Reservas de OTAs
- ✅ `channel_pricing` - Tarifas por canal

### Funções:
- ✅ `update_updated_at_column()` - Atualiza timestamps
- ✅ `generate_reservation_code()` - Gera códigos de reserva
- ✅ `set_reservation_code()` - Define código automaticamente
- ✅ `calculate_dynamic_price()` - Calcula preço com tarifário dinâmico

### Segurança:
- ✅ Row Level Security (RLS) habilitado
- ✅ Políticas de acesso para usuários autenticados
- ✅ Índices para performance

## 🔄 Se Precisar Recriar Tudo

Se você quiser **apagar tudo e recriar do zero**, descomente as linhas no início do arquivo SQL que começam com `DROP TABLE IF EXISTS` e `DROP TYPE IF EXISTS`.

**⚠️ ATENÇÃO:** Isso vai apagar TODOS os dados existentes!

## ✅ Verificação

Após executar, você pode verificar se tudo foi criado corretamente:

```sql
-- Verificar tabelas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verificar tipos
SELECT typname 
FROM pg_type 
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND typtype = 'e'
ORDER BY typname;

-- Verificar funções
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;
```

## 🐛 Resolução de Problemas

### Erro: "type already exists"
✅ **Resolvido** - O schema usa `DO $$ BEGIN ... EXCEPTION` para criar tipos apenas se não existirem

### Erro: "relation does not exist"
✅ **Resolvido** - O schema cria tabelas na ordem correta, respeitando dependências

### Erro: "permission denied"
- Verifique se você está logado como superuser ou tem permissões adequadas
- As políticas RLS permitem acesso a usuários autenticados

## 📚 Próximos Passos

Após executar o schema:

1. ✅ Configure as variáveis de ambiente (`.env`)
2. ✅ Execute `npm run dev` para testar
3. ✅ Crie alguns dados de teste (categorias, quartos, clientes)
4. ✅ Teste as funcionalidades

---

**Última atualização:** 2024-11-12


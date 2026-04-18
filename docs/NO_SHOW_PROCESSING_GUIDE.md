# Guia de Processamento de No-Shows

## 📋 Funcionalidades Implementadas

### 1. ✅ Seleção Manual de No-Shows

**Componente:** `NoShowSelector`

**Funcionalidades:**
- Lista todas as reservas que passaram do horário de check-in (18:00) sem check-in
- Permite seleção múltipla ou individual
- Exibe informações detalhadas (hóspede, datas, valores, tempo após check-in)
- Processa apenas as reservas selecionadas
- Atualização automática a cada minuto

**Como usar:**
1. Acesse "Sistema Tarifário" > "Políticas de Cancelamento" > Tab "No-Shows"
2. Visualize a lista de reservas candidatas
3. Selecione uma ou múltiplas reservas
4. Clique em "Processar Selecionadas"

### 2. ✅ Configuração de Horário Automático

**Componente:** `NoShowScheduleConfig`

**Funcionalidades:**
- Configura horário personalizado para processamento automático
- Ativa/desativa processamento automático por estabelecimento
- Salva configuração no banco de dados

**Como usar:**
1. Acesse a tab "No-Shows"
2. Configure o horário desejado (padrão: 19:00)
3. Ative ou desative o processamento automático
4. Clique em "Salvar Configuração"

### 3. ✅ Edge Function para Processamento Automático

**Arquivo:** `supabase/functions/process-no-shows/index.ts`

**Funcionalidades:**
- Processa no-shows automaticamente via cron job
- Suporta processamento por estabelecimento ou global
- Fallback automático se função RPC não existir
- Retorna relatório de processamento

**Deploy:**
```bash
supabase functions deploy process-no-shows
```

**Configurar Cron:**
```sql
-- Executar diariamente às 19:00
SELECT cron.schedule(
  'process-no-shows-daily',
  '0 19 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://seu-project-ref.supabase.co/functions/v1/process-no-shows',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'process_time', NOW()::text
      )
    ) AS request_id;
  $$
);
```

---

## 🔧 Migrations Necessárias

### 1. Campos de Cancelamento
**Arquivo:** `20251225000015_add_cancellation_fields_to_reservations.sql`

### 2. Função RPC
**Arquivo:** `20251225000016_create_no_show_processor_function.sql`

### 3. Tabela de Aceites
**Arquivo:** `20251225000017_add_policy_acceptance.sql`

### 4. Configuração de Horário ⭐ NOVO
**Arquivo:** `20251225000018_add_no_show_schedule_config.sql`

---

## 📊 Fluxo de Processamento

### Processamento Manual
1. Usuário acessa tab "No-Shows"
2. Sistema lista reservas candidatas (check-in passado + sem check-in)
3. Usuário seleciona reservas
4. Sistema processa cada reserva:
   - Calcula multa baseada na política
   - Marca como "noshow"
   - Cria fatura
   - Registra log

### Processamento Automático
1. Cron job executa Edge Function no horário configurado
2. Edge Function chama função RPC `process_no_shows()`
3. Função RPC identifica e processa no-shows
4. Retorna quantidade processada

---

## ⚙️ Configuração Avançada

### Processar por Estabelecimento

Na Edge Function, passe `establishment_id`:
```json
{
  "establishment_id": "uuid-do-estabelecimento",
  "process_time": "2025-01-25T19:00:00Z"
}
```

### Processar Todos os Estabelecimentos

Não passe `establishment_id` ou passe `null`:
```json
{
  "process_time": "2025-01-25T19:00:00Z"
}
```

---

## 🔍 Monitoramento

### Logs da Edge Function
- Supabase Dashboard > **Edge Functions** > **process-no-shows** > **Logs**

### Verificar Processamento
```sql
-- Verificar no-shows processados hoje
SELECT 
  COUNT(*) as total,
  SUM(cancellation_penalty) as total_penalty
FROM reservations
WHERE no_show_at::date = CURRENT_DATE
  AND status = 'noshow';
```

### Verificar Configurações
```sql
-- Ver configurações de horário
SELECT 
  e.name as establishment,
  nsc.schedule_time,
  nsc.is_active
FROM no_show_schedule_config nsc
JOIN establishments e ON e.id = nsc.establishment_id;
```

---

## ⚠️ Troubleshooting

### Erro: "Função RPC não encontrada"
- Aplicar migration `20251225000016_create_no_show_processor_function.sql`
- Sistema funciona com fallback, mas mais lento

### Erro: "Tabela no_show_schedule_config não existe"
- Aplicar migration `20251225000018_add_no_show_schedule_config.sql`

### Processamento não executa automaticamente
- Verificar se cron job está configurado
- Verificar se Edge Function foi deployada
- Verificar logs da Edge Function

---

## 📝 Notas Importantes

1. **Horário de Check-in:** Sistema considera 18:00 como deadline padrão
2. **Status:** Usa `"noshow"` (não `"no_show"`) para compatibilidade
3. **Multas:** Calculadas automaticamente baseadas na política de cancelamento
4. **Logs:** Registrados em `cancellation_logs` (se migration aplicada)
5. **Faturas:** Criadas automaticamente em `payments`

---

**Status:** ✅ 100% Implementado
**Data:** 2025-01-25


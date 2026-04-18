# Sistema de Estabilidade e Monitoramento

Este documento descreve as medidas implementadas para garantir estabilidade mínima, uptime de 99%, logging de erros e observabilidade do sistema.

## 📊 Objetivos

- **Uptime de 99%**: Sistema disponível 99% do tempo
- **Log de Erros**: Todos os erros são registrados de forma estruturada
- **Observabilidade**: Monitoramento contínuo do sistema
- **Proteção contra Race Conditions**: Reservas simultâneas não causam overbooking

## 🔧 Componentes Implementados

### 1. Sistema de Logging de Erros (`src/lib/errorLogger.ts`)

Sistema centralizado para logging estruturado de erros.

#### Funcionalidades:
- ✅ Logging estruturado com severidade (low, medium, high, critical)
- ✅ Armazenamento no banco de dados (`error_logs` table)
- ✅ Metadata contextual para debugging
- ✅ Stack traces para erros críticos
- ✅ Integração com serviços externos (Sentry, etc.)

#### Uso:
```typescript
import { logError } from "@/lib/errorLogger";

await logError({
  error: new Error("Mensagem de erro"),
  context: "nome-do-contexto",
  severity: "high",
  metadata: { dados_adicionais: "valor" },
});
```

#### Tabela `error_logs`:
- `severity`: Nível de severidade do erro
- `error_type`: Tipo do erro (nome da classe)
- `error_message`: Mensagem do erro
- `context`: Contexto onde o erro ocorreu
- `stack_trace`: Stack trace completo
- `metadata`: Dados adicionais em JSON
- `resolved`: Flag indicando se foi resolvido

### 2. Sistema de Monitoramento (`src/lib/monitoring.ts`)

Monitoramento contínuo da saúde do sistema.

#### Funcionalidades:
- ✅ Health checks periódicos
- ✅ Coleta de métricas (tempo de resposta, uso de memória)
- ✅ Verificação de conectividade (database, storage, API)
- ✅ Alertas automáticos para problemas críticos

#### Health Check:
```typescript
import { performHealthCheck } from "@/lib/monitoring";

const health = await performHealthCheck();
// Retorna: { status: "healthy" | "degraded" | "unhealthy", checks: {...} }
```

#### Monitoramento Periódico:
```typescript
import { startMonitoring, stopMonitoring } from "@/lib/monitoring";

// Iniciar (verifica a cada 5 minutos)
startMonitoring(5 * 60 * 1000);

// Parar
stopMonitoring();
```

### 3. Proteção contra Race Conditions

#### Função SQL `create_reservation_with_lock`

Função que cria reservas com lock atômico para prevenir overbooking quando múltiplas reservas são criadas simultaneamente.

**Características:**
- ✅ Lock exclusivo nas reservas conflitantes (`FOR UPDATE NOWAIT`)
- ✅ Validação atômica de disponibilidade
- ✅ Retorna erro claro se quarto não estiver disponível
- ✅ Retorna erro de "sistema ocupado" se lock não estiver disponível

**Uso:**
```typescript
const { data, error } = await supabase.rpc("create_reservation_with_lock", {
  p_reservation_data: { /* dados da reserva */ },
  p_room_id: "uuid",
  p_category_id: "uuid",
  p_checkin_date: "2024-01-15",
  p_checkout_date: "2024-01-20",
  p_establishment_id: "uuid",
});
```

#### Validação em Duas Camadas

1. **Primeira camada (Frontend)**: Validação rápida antes de tentar criar
   - Verifica se quarto está bloqueado
   - Verifica conflitos básicos
   - Usa `validateRoomAvailability` e `validateCategoryAvailability`

2. **Segunda camada (Backend)**: Validação atômica com lock
   - Lock exclusivo nas reservas
   - Validação garantida sem race conditions
   - Usa `create_reservation_with_lock`

### 4. Health Check Endpoint

Edge Function para verificação de saúde do sistema.

**Endpoint:** `/functions/v1/health-check`

**Resposta:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "ok", "responseTime": 45 },
    "storage": { "status": "ok" }
  },
  "metrics": {
    "database_response_time": 45
  }
}
```

**Status HTTP:**
- `200`: Sistema saudável ou degradado
- `503`: Sistema não saudável

## 📈 Métricas e Observabilidade

### Métricas Coletadas

1. **Tempo de Resposta do Banco de Dados**
   - Medido em cada health check
   - Alertas se > 1 segundo

2. **Tempo de Resposta da API**
   - Medido em operações críticas
   - Logado se > 1 segundo

3. **Uso de Memória** (quando disponível)
   - Coletado via Performance API

4. **Taxa de Erros**
   - Contagem de erros por severidade
   - Armazenada em `error_logs`

### Alertas Automáticos

O sistema gera alertas automáticos quando:
- ✅ Sistema não saudável detectado (status: unhealthy)
- ✅ Sistema degradado detectado (status: degraded)
- ✅ Operações lentas (> 1 segundo)
- ✅ Erros críticos ocorrem

## 🔒 Proteção contra Overbooking

### Fluxo de Criação de Reserva

1. **Validação Inicial** (Frontend)
   ```
   validateRoomAvailability() ou validateCategoryAvailability()
   ↓
   Verifica status do quarto
   Verifica conflitos básicos
   ```

2. **Criação com Lock** (Backend)
   ```
   create_reservation_with_lock()
   ↓
   FOR UPDATE NOWAIT (lock exclusivo)
   ↓
   Valida conflitos com lock
   ↓
   Cria reserva se disponível
   ```

3. **Resultado**
   - ✅ Reserva criada com sucesso
   - ❌ Erro se quarto não disponível
   - ⚠️ Erro de "sistema ocupado" se lock não disponível (retry)

### Garantias

- ✅ **Não há overbooking**: Lock garante que apenas uma reserva é criada por vez
- ✅ **Disponibilidade correta**: Validação atômica garante que a disponibilidade está sempre correta
- ✅ **Retry automático**: Sistema sugere retry quando lock não está disponível

## 🚀 Como Usar

### 1. Verificar Health do Sistema

```bash
curl https://your-project.supabase.co/functions/v1/health-check
```

### 2. Visualizar Logs de Erros

Acesse a tabela `error_logs` no Supabase Dashboard ou crie uma interface de administração.

### 3. Monitorar Métricas

O sistema inicia monitoramento automático ao carregar a aplicação. Verifique os logs do console para alertas.

## 📝 Migrations Necessárias

Execute as seguintes migrations:

1. `20251205000001_create_error_logs_table.sql` - Cria tabela de logs
2. `20251205000002_add_reservation_locks.sql` - Cria função com lock

## 🔍 Troubleshooting

### Sistema reportando "unhealthy"

1. Verificar logs de erro em `error_logs`
2. Verificar conectividade com Supabase
3. Verificar se migrations foram executadas
4. Verificar se há problemas de rede

### Reservas não sendo criadas

1. Verificar se função `create_reservation_with_lock` existe
2. Verificar logs de erro para detalhes
3. Verificar se há locks pendentes no banco

### Erros não sendo logados

1. Verificar se tabela `error_logs` existe
2. Verificar permissões RLS
3. Verificar console do navegador para erros de logging

## 📚 Referências

- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Locks](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Error Handling Best Practices](https://kentcdodds.com/blog/get-a-catch-block-error-message-with-typescript)


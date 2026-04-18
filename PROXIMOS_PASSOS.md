# Próximos Passos Recomendados - Innvator Core

Este documento detalha os próximos passos recomendados para implementar as funcionalidades solicitadas no sistema de gestão hoteleira.

---

## 📋 Índice

1. [Integrar Formulários de Reserva com Banco de Dados Real](#1-integrar-formulários-de-reserva-com-banco-de-dados-real)
2. [Adicionar Sistema de Tarifário Dinâmico](#2-adicionar-sistema-de-tarifário-dinâmico)
3. [Implementar Módulo de Manutenção Funcional](#3-implementar-módulo-de-manutenção-funcional)
4. [Criar Relatórios Financeiros Interativos](#4-criar-relatórios-financeiros-interativos)
5. [Adicionar Channel Manager para OTAs](#5-adicionar-channel-manager-para-otas)

---

## 1. Integrar Formulários de Reserva com Banco de Dados Real

### 📊 Status Atual
- ✅ Schema do banco de dados criado (`reservations` table)
- ✅ Tipos TypeScript gerados
- ❌ Página de Reservas usa dados mockados
- ❌ Não há formulário de criação/edição de reservas
- ❌ Não há integração com Supabase

### 🎯 Objetivos
- Criar formulário completo de reserva integrado com Supabase
- Implementar validação de disponibilidade de quartos
- Adicionar cálculo automático de valores
- Implementar busca e filtros funcionais

### 📝 Tarefas Detalhadas

#### Fase 1: Componente de Formulário de Reserva
- [ ] **Criar `ReservationDialog.tsx`** em `src/components/reservations/`
  - Formulário multi-step ou single form
  - Campos: cliente (busca/select), categoria, check-in, check-out, adultos, crianças
  - Validação de datas (check-out > check-in)
  - Cálculo automático de total baseado em diárias e categoria
  - Seleção de quarto disponível (opcional na criação)

- [ ] **Criar hook `useReservations.ts`** em `src/hooks/`
  - `createReservation()` - criar nova reserva
  - `updateReservation()` - atualizar reserva existente
  - `deleteReservation()` - cancelar reserva
  - `getAvailableRooms()` - buscar quartos disponíveis por período
  - `calculateReservationTotal()` - calcular valor total

- [ ] **Criar função de validação de disponibilidade**
  - Verificar conflitos de datas
  - Considerar status dos quartos (available, maintenance, blocked)
  - Retornar quartos disponíveis para o período

#### Fase 2: Integração com Supabase
- [ ] **Atualizar `Reservations.tsx`**
  - Substituir dados mockados por query do Supabase
  - Implementar `useQuery` para buscar reservas com joins (clients, rooms, categories)
  - Adicionar filtros funcionais (status, período, cliente)
  - Implementar busca por código, nome do cliente, quarto

- [ ] **Criar função para gerar código de reserva**
  - Usar função do banco `generate_reservation_code()` ou criar no frontend
  - Formato: RSV + 6 dígitos

- [ ] **Implementar ações de reserva**
  - Check-in: atualizar status e room.status para 'occupied'
  - Check-out: atualizar status e room.status para 'cleaning'
  - Cancelar: atualizar status e liberar quarto se atribuído

#### Fase 3: Melhorias e Validações
- [ ] **Validações de negócio**
  - Verificar capacidade do quarto (adultos + crianças)
  - Validar período mínimo de estadia (se houver)
  - Verificar disponibilidade antes de confirmar
  - Validar cliente existente ou criar novo

- [ ] **Atualizar status de quartos automaticamente**
  - Trigger ou função no frontend para atualizar `rooms.status`
  - Quando reserva confirmada → verificar se precisa atribuir quarto
  - Quando check-in → room.status = 'occupied'
  - Quando check-out → room.status = 'cleaning'

- [ ] **Criar view ou função SQL para disponibilidade**
  - Função `get_available_rooms(checkin_date, checkout_date, category_id)`
  - Retornar quartos disponíveis considerando reservas existentes

### 🔧 Arquivos a Criar/Modificar

**Novos:**
- `src/components/reservations/ReservationDialog.tsx`
- `src/components/reservations/ReservationCard.tsx` (opcional)
- `src/hooks/useReservations.ts`
- `src/lib/reservationUtils.ts` (funções auxiliares)

**Modificar:**
- `src/pages/Reservations.tsx` - integrar com Supabase
- `src/components/dashboard/RecentReservations.tsx` - usar dados reais

**Migrations (se necessário):**
- `supabase/migrations/XXXXXX_add_reservation_functions.sql` - funções de disponibilidade

### ⏱️ Estimativa
- **Fase 1:** 4-6 horas
- **Fase 2:** 3-4 horas
- **Fase 3:** 2-3 horas
- **Total:** 9-13 horas

---

## 2. Adicionar Sistema de Tarifário Dinâmico

### 📊 Status Atual
- ✅ Tabela `room_categories` com `base_price`
- ❌ Não há sistema de tarifas dinâmicas
- ❌ Não há regras de precificação (alta/baixa temporada, dias da semana)
- ❌ Não há descontos ou promoções

### 🎯 Objetivos
- Implementar sistema de tarifas variáveis por data
- Criar regras de precificação (temporada, dias da semana, eventos)
- Adicionar descontos e promoções
- Integrar cálculo automático no formulário de reserva

### 📝 Tarefas Detalhadas

#### Fase 1: Schema do Banco de Dados
- [ ] **Criar migration para tabelas de tarifário**
  ```sql
  -- Tabela de períodos/temporadas
  CREATE TABLE pricing_seasons (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    multiplier DECIMAL(5,2) DEFAULT 1.0, -- multiplicador do preço base
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Tabela de regras de precificação
  CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY,
    category_id UUID REFERENCES room_categories(id),
    season_id UUID REFERENCES pricing_seasons(id),
    day_of_week INTEGER, -- 0-6 (domingo-sábado), NULL = todos
    price_override DECIMAL(10,2), -- preço fixo ou NULL para usar multiplier
    min_stay_nights INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Tabela de descontos/promoções
  CREATE TABLE promotions (
    id UUID PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    discount_type TEXT, -- 'percentage' ou 'fixed'
    discount_value DECIMAL(10,2),
    start_date DATE,
    end_date DATE,
    min_stay_nights INTEGER,
    applicable_categories UUID[], -- NULL = todas
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] **Criar função SQL para calcular preço**
  ```sql
  CREATE FUNCTION calculate_room_price(
    category_id UUID,
    checkin_date DATE,
    checkout_date DATE,
    promotion_code TEXT DEFAULT NULL
  ) RETURNS DECIMAL(10,2) AS $$
  -- Lógica de cálculo considerando:
  -- - Preço base da categoria
  -- - Temporada/estação
  -- - Dia da semana
  -- - Promoções aplicáveis
  $$;
  ```

#### Fase 2: Interface de Gerenciamento
- [ ] **Criar página `Pricing.tsx`** (nova rota `/tarifario`)
  - Tabs: Temporadas, Regras, Promoções
  - Listagem e CRUD para cada entidade
  - Calendário visual de temporadas

- [ ] **Criar componentes de formulário**
  - `SeasonDialog.tsx` - criar/editar temporadas
  - `PricingRuleDialog.tsx` - criar/editar regras
  - `PromotionDialog.tsx` - criar/editar promoções

- [ ] **Criar componente de visualização**
  - Calendário de tarifas por categoria
  - Gráfico de variação de preços ao longo do tempo

#### Fase 3: Integração com Reservas
- [ ] **Atualizar `ReservationDialog.tsx`**
  - Calcular preço dinamicamente ao selecionar datas
  - Mostrar breakdown do preço (base + temporada + promoção)
  - Campo para código de promoção
  - Atualizar total em tempo real

- [ ] **Criar hook `usePricing.ts`**
  - `calculatePrice()` - calcular preço para período
  - `getSeasons()` - buscar temporadas
  - `getPromotions()` - buscar promoções ativas
  - `validatePromotionCode()` - validar código de promoção

#### Fase 4: Funcionalidades Avançadas
- [ ] **Implementar precificação por demanda**
  - Ajuste automático baseado em ocupação
  - Alertas de baixa/alta demanda

- [ ] **Exportar/Importar tarifas**
  - Exportar para Excel/CSV
  - Importar em lote

- [ ] **Histórico de mudanças**
  - Log de alterações de preços
  - Versionamento de tarifas

### 🔧 Arquivos a Criar/Modificar

**Novos:**
- `src/pages/Pricing.tsx`
- `src/components/pricing/SeasonDialog.tsx`
- `src/components/pricing/PricingRuleDialog.tsx`
- `src/components/pricing/PromotionDialog.tsx`
- `src/components/pricing/PricingCalendar.tsx`
- `src/hooks/usePricing.ts`
- `src/lib/pricingUtils.ts`

**Migrations:**
- `supabase/migrations/XXXXXX_create_pricing_tables.sql`

**Modificar:**
- `src/App.tsx` - adicionar rota `/tarifario`
- `src/components/layout/Sidebar.tsx` - adicionar link
- `src/components/reservations/ReservationDialog.tsx` - integrar cálculo

### ⏱️ Estimativa
- **Fase 1:** 3-4 horas
- **Fase 2:** 6-8 horas
- **Fase 3:** 3-4 horas
- **Fase 4:** 4-6 horas
- **Total:** 16-22 horas

---

## 3. Implementar Módulo de Manutenção Funcional

### 📊 Status Atual
- ✅ Tabela `maintenance_tickets` criada no banco
- ✅ Tipos TypeScript gerados
- ❌ Não há página/interface de manutenção
- ❌ Não há integração com status de quartos

### 🎯 Objetivos
- Criar interface completa de gerenciamento de manutenção
- Integrar com status de quartos
- Adicionar notificações e alertas
- Implementar histórico e relatórios

### 📝 Tarefas Detalhadas

#### Fase 1: Página de Manutenção
- [ ] **Criar página `Maintenance.tsx`** (nova rota `/manutencao`)
  - Listagem de tickets com filtros (status, prioridade, quarto)
  - Cards de estatísticas (abertos, em progresso, urgentes)
  - Tabela com ações rápidas

- [ ] **Criar componentes principais**
  - `MaintenanceTicketDialog.tsx` - criar/editar ticket
  - `MaintenanceCard.tsx` - card de ticket
  - `MaintenanceFilters.tsx` - filtros avançados

- [ ] **Integrar com Supabase**
  - CRUD completo de tickets
  - Buscar quartos para seleção
  - Atualizar status de quartos automaticamente

#### Fase 2: Funcionalidades de Negócio
- [ ] **Atualização automática de status de quarto**
  - Quando ticket criado → `room.status = 'maintenance'`
  - Quando ticket concluído → `room.status = 'available'` (se não houver reserva)
  - Validar se quarto pode ser colocado em manutenção

- [ ] **Sistema de prioridades e alertas**
  - Notificações para tickets urgentes
  - Dashboard com tickets pendentes
  - Alertas quando ticket aberto há muito tempo

- [ ] **Atribuição de responsáveis**
  - Campo `assigned_to` funcional
  - Lista de usuários para atribuição
  - Histórico de atribuições

#### Fase 3: Integração com Outros Módulos
- [ ] **Integrar com Reservas**
  - Não permitir reserva em quarto em manutenção
  - Alertar ao tentar fazer check-in em quarto em manutenção
  - Sugerir quartos alternativos

- [ ] **Integrar com Dashboard**
  - Widget de manutenções pendentes
  - Gráfico de tempo médio de resolução
  - Alertas de quartos bloqueados

- [ ] **Criar relatórios**
  - Relatório de manutenções por período
  - Análise de quartos com mais problemas
  - Tempo médio de resolução por prioridade

#### Fase 4: Funcionalidades Avançadas
- [ ] **Agendamento de manutenção preventiva**
  - Criar tickets recorrentes
  - Notificações de manutenções programadas

- [ ] **Upload de fotos/documentos**
  - Anexar imagens aos tickets
  - Armazenar no Supabase Storage

- [ ] **Histórico e comentários**
  - Timeline de eventos do ticket
  - Comentários e atualizações

### 🔧 Arquivos a Criar/Modificar

**Novos:**
- `src/pages/Maintenance.tsx`
- `src/components/maintenance/MaintenanceTicketDialog.tsx`
- `src/components/maintenance/MaintenanceCard.tsx`
- `src/components/maintenance/MaintenanceFilters.tsx`
- `src/hooks/useMaintenance.ts`
- `src/lib/maintenanceUtils.ts`

**Modificar:**
- `src/App.tsx` - adicionar rota `/manutencao`
- `src/components/layout/Sidebar.tsx` - adicionar link
- `src/pages/Reservations.tsx` - validar quartos em manutenção
- `src/pages/Dashboard.tsx` - adicionar widget de manutenção

**Migrations (se necessário):**
- Adicionar índices para performance
- Criar views para relatórios

### ⏱️ Estimativa
- **Fase 1:** 4-5 horas
- **Fase 2:** 3-4 horas
- **Fase 3:** 3-4 horas
- **Fase 4:** 4-6 horas
- **Total:** 14-19 horas

---

## 4. Criar Relatórios Financeiros Interativos

### 📊 Status Atual
- ✅ Tabelas `reservations` e `payments` criadas
- ✅ Página `Financial.tsx` com estrutura básica
- ❌ Dados mockados
- ❌ Gráficos não implementados
- ❌ Relatórios não funcionais

### 🎯 Objetivos
- Criar relatórios financeiros interativos com gráficos
- Implementar filtros por período, categoria, canal
- Adicionar exportação de dados
- Criar dashboards financeiros

### 📝 Tarefas Detalhadas

#### Fase 1: Queries e Funções de Dados
- [ ] **Criar funções SQL para relatórios**
  ```sql
  -- Faturamento por período
  CREATE FUNCTION get_revenue_by_period(
    start_date DATE,
    end_date DATE
  ) RETURNS TABLE(...) AS $$ ... $$;

  -- Recebimentos por método de pagamento
  CREATE FUNCTION get_payments_by_method(
    start_date DATE,
    end_date DATE
  ) RETURNS TABLE(...) AS $$ ... $$;

  -- Análise de canais (OTAs vs Direto)
  CREATE FUNCTION get_revenue_by_channel(
    start_date DATE,
    end_date DATE
  ) RETURNS TABLE(...) AS $$ ... $$;
  ```

- [ ] **Criar views materializadas (opcional)**
  - View de faturamento diário
  - View de recebimentos por período
  - View de comissões de OTAs

- [ ] **Criar hooks de dados**
  - `useFinancialReports.ts` - buscar dados de relatórios
  - `useRevenue.ts` - dados de faturamento
  - `usePayments.ts` - dados de pagamentos

#### Fase 2: Componentes de Gráficos
- [ ] **Atualizar `Financial.tsx`**
  - Substituir dados mockados por queries reais
  - Implementar filtros de período (hoje, semana, mês, customizado)
  - Adicionar loading states

- [ ] **Criar componentes de gráficos**
  - `RevenueChart.tsx` - gráfico de faturamento (linha/área)
  - `PaymentMethodChart.tsx` - gráfico de métodos de pagamento (pizza/barra)
  - `ChannelComparisonChart.tsx` - comparação de canais (barra)
  - `CashFlowChart.tsx` - fluxo de caixa (linha)
  - Usar Recharts (já instalado)

- [ ] **Criar cards de métricas**
  - Faturamento total
  - Recebido vs A receber
  - Taxa de conversão de pagamentos
  - Média de diária
  - Taxa de ocupação (revenue)

#### Fase 3: Relatórios Detalhados
- [ ] **Implementar aba "Relatórios"**
  - Relatório de Faturamento
    - Tabela detalhada por reserva
    - Filtros: período, categoria, status
    - Exportar para Excel/PDF
  - Relatório de Fluxo de Caixa
    - Entradas e saídas por dia
    - Saldo acumulado
  - Relatório de Fechamento
    - Consolidação mensal
    - Comparação com meses anteriores
  - Relatório de Taxa OTAs
    - Comissões por OTA
    - Rentabilidade por canal

- [ ] **Criar componentes de relatório**
  - `BillingReport.tsx`
  - `CashFlowReport.tsx`
  - `ClosingReport.tsx`
  - `OTACommissionReport.tsx`

#### Fase 4: Funcionalidades Avançadas
- [ ] **Exportação de dados**
  - Exportar para CSV
  - Exportar para PDF (usar biblioteca como jsPDF)
  - Email de relatórios (futuro)

- [ ] **Comparações e análises**
  - Comparar períodos (mês atual vs anterior)
  - Projeções baseadas em histórico
  - Alertas de metas não atingidas

- [ ] **Dashboard interativo**
  - Filtros globais que afetam todos os gráficos
  - Drill-down nos gráficos
  - Tooltips informativos

### 🔧 Arquivos a Criar/Modificar

**Novos:**
- `src/components/financial/RevenueChart.tsx`
- `src/components/financial/PaymentMethodChart.tsx`
- `src/components/financial/ChannelComparisonChart.tsx`
- `src/components/financial/CashFlowChart.tsx`
- `src/components/financial/BillingReport.tsx`
- `src/components/financial/CashFlowReport.tsx`
- `src/components/financial/ClosingReport.tsx`
- `src/components/financial/OTACommissionReport.tsx`
- `src/hooks/useFinancialReports.ts`
- `src/hooks/useRevenue.ts`
- `src/lib/financialUtils.ts`
- `src/lib/exportUtils.ts` (para exportação)

**Modificar:**
- `src/pages/Financial.tsx` - integrar todos os componentes
- `src/components/dashboard/RevenueChart.tsx` - usar dados reais

**Migrations:**
- `supabase/migrations/XXXXXX_create_financial_functions.sql`

### ⏱️ Estimativa
- **Fase 1:** 3-4 horas
- **Fase 2:** 6-8 horas
- **Fase 3:** 8-10 horas
- **Fase 4:** 4-6 horas
- **Total:** 21-28 horas

---

## 5. Adicionar Channel Manager para OTAs

### 📊 Status Atual
- ✅ Campo `channel` na tabela `reservations`
- ❌ Não há integração com OTAs
- ❌ Não há sincronização de disponibilidade
- ❌ Não há gestão de tarifas por canal

### 🎯 Objetivos
- Criar sistema de gerenciamento de canais (OTAs)
- Implementar sincronização de disponibilidade
- Adicionar gestão de tarifas por canal
- Criar interface de configuração de OTAs

### 📝 Tarefas Detalhadas

#### Fase 1: Schema e Estrutura Base
- [ ] **Criar migration para tabelas de OTAs**
  ```sql
  -- Tabela de OTAs configuradas
  CREATE TABLE ota_channels (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL, -- Booking.com, Airbnb, etc.
    api_key TEXT,
    api_secret TEXT,
    is_active BOOLEAN DEFAULT true,
    sync_enabled BOOLEAN DEFAULT false,
    commission_rate DECIMAL(5,2), -- taxa de comissão
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Mapeamento de reservas OTA
  CREATE TABLE ota_reservations (
    id UUID PRIMARY KEY,
    reservation_id UUID REFERENCES reservations(id),
    ota_channel_id UUID REFERENCES ota_channels(id),
    ota_reservation_code TEXT, -- código da reserva na OTA
    ota_guest_name TEXT,
    ota_guest_email TEXT,
    synced_at TIMESTAMPTZ,
    sync_status TEXT, -- 'pending', 'synced', 'error'
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Configurações de tarifa por canal
  CREATE TABLE channel_pricing (
    id UUID PRIMARY KEY,
    ota_channel_id UUID REFERENCES ota_channels(id),
    category_id UUID REFERENCES room_categories(id),
    price_multiplier DECIMAL(5,2) DEFAULT 1.0,
    fixed_price DECIMAL(10,2),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] **Criar enum para canais**
  - Adicionar ao schema: 'booking', 'airbnb', 'expedia', 'direct', etc.

#### Fase 2: Interface de Configuração
- [ ] **Criar página `ChannelManager.tsx`** (nova rota `/channel-manager`)
  - Listagem de OTAs configuradas
  - Status de sincronização
  - Configurações de cada OTA

- [ ] **Criar componentes**
  - `OTADialog.tsx` - adicionar/editar OTA
  - `ChannelPricingDialog.tsx` - configurar tarifas por canal
  - `SyncStatusCard.tsx` - status de sincronização
  - `OTAReservationsList.tsx` - listar reservas de OTAs

#### Fase 3: Sincronização Básica (Manual)
- [ ] **Implementar sincronização manual**
  - Botão para sincronizar disponibilidade
  - Botão para importar reservas
  - Log de sincronizações

- [ ] **Criar funções de sincronização**
  - `syncAvailability()` - atualizar disponibilidade nas OTAs
  - `importReservations()` - importar reservas das OTAs
  - `updatePricing()` - atualizar tarifas nas OTAs

- [ ] **Criar hook `useChannelManager.ts`**
  - Gerenciar OTAs
  - Sincronizar dados
  - Buscar reservas de OTAs

#### Fase 4: Integração com APIs (Futuro)
- [ ] **Preparar estrutura para APIs reais**
  - Criar serviços abstratos para cada OTA
  - Implementar adapters para diferentes APIs
  - Sistema de webhooks para receber atualizações

- [ ] **Integrações prioritárias**
  - Booking.com (XML/API)
  - Airbnb (API)
  - Expedia (EAN)

- [ ] **Sincronização automática**
  - Jobs agendados (usar Supabase Edge Functions ou cron)
  - Sincronização em tempo real via webhooks
  - Tratamento de erros e retry

#### Fase 5: Funcionalidades Avançadas
- [ ] **Gestão de bloqueios**
  - Bloquear quartos para OTAs
  - Bloquear períodos específicos
  - Sincronizar bloqueios

- [ ] **Relatórios de canais**
  - Performance por OTA
  - Comissões e taxas
  - Comparação de canais

- [ ] **Alertas e notificações**
  - Alertas de falha de sincronização
  - Notificações de novas reservas de OTAs
  - Alertas de conflitos de reserva

### 🔧 Arquivos a Criar/Modificar

**Novos:**
- `src/pages/ChannelManager.tsx`
- `src/components/channels/OTADialog.tsx`
- `src/components/channels/ChannelPricingDialog.tsx`
- `src/components/channels/SyncStatusCard.tsx`
- `src/components/channels/OTAReservationsList.tsx`
- `src/hooks/useChannelManager.ts`
- `src/services/ota/` (pasta para serviços de OTA)
  - `bookingService.ts`
  - `airbnbService.ts`
  - `baseOTAService.ts` (interface base)
- `src/lib/channelUtils.ts`

**Modificar:**
- `src/App.tsx` - adicionar rota `/channel-manager`
- `src/components/layout/Sidebar.tsx` - adicionar link
- `src/pages/Reservations.tsx` - mostrar origem da reserva (canal)
- `src/pages/Financial.tsx` - incluir dados de OTAs nos relatórios

**Migrations:**
- `supabase/migrations/XXXXXX_create_ota_tables.sql`

**Edge Functions (futuro):**
- `supabase/functions/sync-otas/` - função para sincronização

### ⏱️ Estimativa
- **Fase 1:** 2-3 horas
- **Fase 2:** 4-5 horas
- **Fase 3:** 6-8 horas
- **Fase 4:** 16-24 horas (depende das APIs)
- **Fase 5:** 6-8 horas
- **Total:** 34-48 horas (Fases 1-3: 12-16 horas para MVP)

---

## 📊 Resumo de Prioridades

### 🔴 Alta Prioridade (MVP)
1. **Integrar Formulários de Reserva** - Base do sistema
2. **Módulo de Manutenção** - Funcionalidade crítica
3. **Relatórios Financeiros Básicos** - Necessário para gestão

### 🟡 Média Prioridade
4. **Sistema de Tarifário Dinâmico** - Diferencial competitivo
5. **Channel Manager Básico** - Importante para receita

### 🟢 Baixa Prioridade (Melhorias)
- Channel Manager com APIs reais
- Relatórios Financeiros Avançados
- Funcionalidades avançadas de cada módulo

---

## 🛠️ Dependências e Pré-requisitos

### Antes de Começar
- [ ] Configurar variáveis de ambiente do Supabase
- [ ] Executar migrations no banco de dados
- [ ] Verificar autenticação funcionando
- [ ] Ter dados de teste (categorias, quartos, clientes)

### Bibliotecas Adicionais (se necessário)
- `date-fns` - ✅ já instalado
- `recharts` - ✅ já instalado
- `jspdf` - para exportação de PDFs (adicionar se necessário)
- `xlsx` - para exportação de Excel (adicionar se necessário)

---

## 📝 Notas de Implementação

### Padrões a Seguir
1. **Componentes:** Usar shadcn-ui já configurado
2. **Estado:** React Query para dados do servidor
3. **Formulários:** React Hook Form + Zod (já instalados)
4. **Notificações:** Sonner (já instalado)
5. **Estilo:** Tailwind CSS

### Boas Práticas
- Sempre validar dados no frontend e backend
- Implementar loading states
- Tratar erros adequadamente
- Usar TypeScript strict
- Seguir padrão de nomenclatura do projeto
- Criar testes quando possível

### Estrutura de Pastas
```
src/
├── components/
│   ├── reservations/
│   ├── pricing/
│   ├── maintenance/
│   ├── financial/
│   └── channels/
├── hooks/
├── lib/
├── pages/
└── services/ (para integrações externas)
```

---

## 🚀 Como Começar

1. **Escolha uma funcionalidade** da lista acima
2. **Crie uma branch** para a feature
3. **Siga as tarefas** na ordem das fases
4. **Teste cada fase** antes de avançar
5. **Faça commit** após cada fase concluída

---

**Última atualização:** 2024-11-11
**Versão do documento:** 1.0


# 🗺️ Roadmap de Desenvolvimento - Innvator Core

## Visão Geral

Este roadmap apresenta as 5 funcionalidades principais a serem implementadas, com estimativas de tempo e prioridades.

---

## ✅ Implementações Realizadas

### 🎨 Portal do Hóspede (Guest Dashboard)
- ✅ **Redesign completo moderno e premium** (estilo Booking/Airbnb/Expedia)
  - Header com logo, saudação personalizada, avatar e menu de idioma
  - Hero Card para estadia atual com gradiente moderno
  - Ações rápidas: Check-in online, Enviar documentos, Late checkout, Nota fiscal, Falar com hotel
  - Stepper visual de progresso do check-in
  - Seção de reservas canceladas (design neutro e colapsável)
  - Cards de navegação rápida (Novo Check-in, Histórico, Suporte, Perfil)
  - Lista de serviços disponíveis com ícones
  - Design mobile-first, responsivo e com microinterações

### 🔔 Sistema de Notificações
- ✅ **Sistema completo de notificações em tempo real**
  - Notificações de check-in próximo (próximos 2 dias) com horário correto
  - Notificações de check-out próximo (próximos 2 dias) com horário correto
  - Notificações de chamados de manutenção (completados e em progresso)
  - Funcionalidade de marcar como lida
  - Funcionalidade de excluir notificações
  - Priorização por urgência (alta, média, baixa)
  - Atualização automática a cada 1 minuto
  - Persistência de estado (notificações lidas/excluídas)

### 🔧 Módulo de Manutenção
- ✅ **Sistema completo de manutenção (Interface administrativa + hóspede)**
  - Página completa de gerenciamento (`/manutencao`)
  - Cards de estatísticas (abertos, em progresso, urgentes, completados)
  - Tabela de tickets com filtros avançados (status, prioridade, busca)
  - CRUD completo de tickets (criar, editar, iniciar, completar, cancelar)
  - Integração automática com status de quartos (atualiza status ao criar/completar)
  - Sistema de prioridades (low, medium, high, urgent)
  - Sistema de status (open, in_progress, completed, cancelled)
  - Dialog para criação/edição de tickets
  - Interface do hóspede (criação de chamados via guest dashboard)
  - Notificações de status (completado, em progresso)
  - Associação correta com conta do hóspede
  - Hook `useMaintenance` completo com todas as operações

### 📱 Check-in Online
- ✅ **Sistema de check-in digital**
  - Formulário de check-in completo
  - Stepper visual de progresso (Reserva confirmada → Dados pessoais → Documentos → Check-in concluído)
  - Envio de documentos
  - Validação de etapas

### 🎁 Solicitações Especiais
- ✅ **Sistema de solicitações do hóspede**
  - Modal/dialog para solicitações
  - Descrição atualizada (early check-in, late checkout, outros pedidos)
  - Integração com reservas

### 👤 Gestão de Conta e LGPD
- ✅ **Funcionalidade de exclusão de conta (LGPD)**
  - Desativação de conta com conformidade LGPD
  - Substituição de email por genérico (permite re-registro)
  - Mantém dados de reservas e histórico fiscal (obrigações legais)
  - Mensagens claras sobre retenção de dados
  - Prevenção de login para contas excluídas

### 📞 Integração de Contato
- ✅ **Menu "Falar com Hotel"**
  - Opção de WhatsApp do estabelecimento
  - Opção de Telefone do estabelecimento
  - Exibição correta de números (DDI + número)
  - Formatação adequada dos contatos

### 📧 Sistema de Envio de E-mails
- ✅ **Sistema completo de e-mails com múltiplos provedores**
  - Suporte a 5 provedores: SMTP, SendGrid, Mailgun, AWS SES, Resend
  - Configurações globais de e-mail (EmailSettingsManager)
  - Sistema de fila de e-mails para processamento assíncrono
  - Retry automático com backoff exponencial
  - Suporte a CC e BCC
  - Histórico completo de e-mails enviados (EmailLogsManager)
  - Reenvio de e-mails falhados

- ✅ **Sistema de Templates Personalizáveis**
  - Editor HTML completo para templates (EmailTemplatesManager)
  - Variáveis dinâmicas com sintaxe `{{variable_name}}`
  - Preview de templates antes de enviar
  - Envio de e-mails de teste
  - Múltiplos templates por evento (apenas um ativo)
  - Templates com logo, cores personalizadas e rodapé

- ✅ **Tipos de Eventos e Ações Automáticas**
  - **Reservas:**
    - `reservation.created` - E-mail quando reserva é criada
    - `reservation.imported` - E-mail quando reserva é importada de OTA
    - `reservation.cancelled` - E-mail quando reserva é cancelada
    - `reservation.extended` - E-mail quando reserva é estendida
    - `reservation.overbooking` - E-mail de alerta de overbooking
  
  - **Pagamentos:**
    - `payment.confirmed` - E-mail quando pagamento é confirmado
    - `payment.pending` - E-mail de lembrete de pagamento pendente
  
  - **Check-in/Check-out:**
    - `checkin.confirmed` - E-mail de confirmação de check-in
    - `checkin.reception.notification` - E-mail para recepção sobre check-in
    - `checkout.reminder` - E-mail de lembrete de check-out (configurável por dias)
    - `checkout.completed` - E-mail quando check-out é concluído
  
  - **Hóspedes:**
    - `guest.password_reset` - E-mail de recuperação de senha do hóspede
  
  - **Documentos:**
    - `fiscal_document.request` - E-mail ao solicitar documento fiscal
  
  - **Funcionários:**
    - `employee.added_to_establishment` - E-mail quando funcionário é adicionado ao estabelecimento

- ✅ **Integrações Automáticas**
  - Disparo automático ao criar reserva (`useReservations`)
  - Disparo automático ao confirmar pagamento (`ReservationPaymentModal`)
  - Disparo automático ao fazer check-in (`useReservations`, `CheckinCompleteStep`)
  - Disparo automático ao estender reserva (`ReservationPaymentModal`)
  - Disparo automático ao cancelar reserva (`useReservations`)
  - Disparo automático ao detectar overbooking (`usePendingReservations`)
  - Disparo automático ao solicitar documento fiscal (`FiscalDocumentRequest`)
  - Disparo automático ao resetar senha do hóspede (`GuestResetPassword`)
  - Disparo automático ao adicionar funcionário (`Employees`)
  - Envio programado de lembretes de check-out (`sendCheckoutReminders`)

- ✅ **Engine de Templates**
  - Processamento de variáveis dinâmicas
  - Extração automática de variáveis disponíveis
  - Validação de variáveis necessárias
  - Geração automática de variáveis de reserva
  - Suporte a formatação de datas, moedas e textos

- ✅ **Variáveis Disponíveis nos Templates**
  - Dados do hóspede: `{{guest_name}}`, `{{guest_email}}`, `{{guest_phone}}`
  - Dados da reserva: `{{reservation_code}}`, `{{checkin_date}}`, `{{checkout_date}}`, `{{checkin_time}}`, `{{checkout_time}}`
  - Dados financeiros: `{{total_amount}}`, `{{paid_amount}}`, `{{payment_status}}`
  - Dados do quarto: `{{room_number}}`, `{{category_name}}`
  - Dados dos hóspedes: `{{adults}}`, `{{children}}`
  - Dados do hotel: `{{hotel_name}}`, `{{hotel_address}}`, `{{hotel_contact}}`, `{{hotel_email}}`, `{{hotel_phone}}`, `{{hotel_policies}}`

- ✅ **Interface de Gerenciamento (SuperAdmin)**
  - Aba "E-mails" com 4 sub-abas:
    1. **Templates** - Gerenciar templates de e-mail
    2. **Configurações** - Configurar provedor de e-mail
    3. **Fila** - Visualizar e processar fila de e-mails
    4. **Logs** - Histórico completo de e-mails enviados
  - Filtros avançados por status, evento, destinatário
  - Visualização de detalhes de cada e-mail
  - Teste de configurações e templates

### 💰 Sistema Tarifário Dinâmico
- ✅ **Sistema completo de tarifário e precificação**
  - Página de tarifário (`/tarifario-legado`) com múltiplas abas
  - Sistema de planos de tarifa (pricing_plans) com tipos e códigos
  - Sistema de temporadas (pricing_seasons) com multiplicadores
  - Sistema de regras de precificação (pricing_rules) por dia da semana, temporada, mínimo de noites
  - Sistema de promoções (promotions) com códigos e limites de uso
  - Tarifário simplificado para configuração rápida
  - Calendário de tarifas (SimplePricingCalendar) para visualização mensal
  - **Sistema avançado de rate calendar** (`PMSRateSystem`)
    - Grid de calendário interativo (RateCalendarGrid)
    - Edição em massa de tarifas
    - Regras dinâmicas de precificação (DynamicRulesView)
    - Restrições de disponibilidade (RestrictionsView)
    - Dashboard de preços com métricas e analytics
    - Cálculo automático de preços com função RPC `calculate_rate_price`
    - Integração com ocupação e taxa de pickup
  - Integração completa com reservas (cálculo automático de preços)
  - Função RPC `calculate_rate_price` que aplica todas as regras dinâmicas
  - Suporte a preços por adulto/criança
  - Sistema de ajustes baseado em ocupação

### 📋 Formulários de Reserva
- ✅ **Sistema completo de reservas**
  - Página principal de reservas (`/reservas`) com múltiplas visualizações
  - Formulário completo de criação/edição (ReservationDialog)
  - Dialog de reserva rápida (QuickReservationDialog)
  - Calendário de reservas interativo (ReservationCalendarMap)
  - Timeline de reservas (ReservationTimeline)
  - Integração completa com Supabase
  - Validação de disponibilidade de quartos
  - Cálculo automático de preços usando sistema tarifário
  - Sistema de bloqueios de quartos
  - Check-in e check-out de reservas
  - Cancelamento de reservas com confirmação
  - Transferência de reservas entre quartos
  - Modal de pagamentos integrado
  - Sistema de pré-reservas e confirmação
  - Filtros avançados (status, datas, busca)
  - Página de detalhes da reserva (ReservationDetails)
  - Hook `useReservations` completo com todas as operações
  - Proteção contra race conditions com locks
  - Sistema de pendências (OTAs, balcão, sem check-in, overbookings)

---

## 📊 Quadro de Prioridades

| Funcionalidade | Prioridade | Estimativa | Status |
|---------------|------------|------------|--------|
| **1. Formulários de Reserva** | 🔴 Alta | 9-13h | ✅ **Completo** |
| **2. Tarifário Dinâmico** | 🟡 Média | 16-22h | ✅ **Completo** |
| **3. Módulo de Manutenção** | 🔴 Alta | 14-19h | ✅ **Completo** |
| **4. Sistema de E-mails** | 🔴 Alta | 18-24h | ✅ **Completo** |
| **5. Integração FNRH Digital** | 🔴 Alta | 20-28h | ⏳ **Próximo** |
| **6. Relatórios Financeiros** | 🔴 Alta | 21-28h | ⏳ Pendente |
| **7. Channel Manager OTAs** | 🟡 Média | 12-16h (MVP) | ⏳ Pendente |

**Total Estimado (MVP):** 72-98 horas

---

## 🎯 Fase 1: MVP Essencial (4-6 semanas)

### ✅ Objetivos
- Sistema de reservas funcional
- Manutenção básica operacional
- Relatórios financeiros básicos

### 📋 Tarefas

#### Semana 1-2: Reservas
- [x] Formulário de criação de reservas
- [x] Integração com Supabase
- [x] Validação de disponibilidade
- [x] Listagem e filtros
- [x] Calendário de reservas
- [x] Sistema de bloqueios
- [x] Check-in/check-out
- [x] Sistema de pagamentos

#### Semana 3: Manutenção
- [x] Interface de tickets
- [x] Integração com status de quartos
- [x] CRUD completo
- [x] Sistema de prioridades e status
- [x] Interface do hóspede
- [x] Notificações de manutenção

#### Semana 4-5: Financeiro
- [ ] Gráficos básicos
- [ ] Relatórios principais
- [ ] Exportação de dados

---

## 🎯 Fase 2: Diferenciais (3-4 semanas)

### ✅ Objetivos
- Tarifário dinâmico
- Channel Manager básico

### 📋 Tarefas

#### Semana 6-7: Tarifário
- [x] Sistema de temporadas
- [x] Regras de precificação
- [x] Promoções e descontos
- [x] Calendário de tarifas
- [x] Sistema de rate calendar avançado
- [x] Regras dinâmicas de precificação
- [x] Dashboard de preços e analytics
- [x] Integração com reservas

#### Semana 8-9: Channel Manager
- [ ] Interface de configuração
- [ ] Sincronização manual
- [ ] Gestão de tarifas por canal

---

## 🎯 Fase 3: Integrações Regulatórias e Avançadas

### 📋 Próximo Módulo: Integração FNRH Digital

#### 🎯 Objetivo
Integração com a API FNRH Digital (Ficha Nacional de Registro de Hóspedes) para cumprimento das obrigações legais de registro de hóspedes no Brasil.

#### 📊 Status
- ⏳ **Pendente** - Próximo módulo a ser implementado
- 📄 Documentação técnica disponível: `Manual API FNRH Digital.pdf`

#### 🔧 Funcionalidades a Implementar
- **Autenticação e Credenciais**
  - Configuração de credenciais da API FNRH Digital
  - Gerenciamento de tokens de autenticação
  - Validação de certificados e segurança

- **Registro Automático de Hóspedes**
  - Envio automático de dados de hóspedes ao FNRH Digital
  - Integração com processo de check-in
  - Sincronização de dados de reservas
  - Validação de dados obrigatórios antes do envio

- **Gestão de Registros**
  - Interface para visualizar registros enviados
  - Histórico de comunicações com FNRH Digital
  - Status de cada registro (enviado, confirmado, erro)
  - Retry automático em caso de falha

- **Dados Obrigatórios**
  - Nome completo do hóspede
  - Documento de identificação (CPF, RG, Passaporte)
  - Nacionalidade
  - Data de nascimento
  - Endereço completo
  - Data de entrada e saída
  - Número do quarto
  - Dados do estabelecimento

- **Conformidade Legal**
  - Cumprimento do Decreto 5.123/2004
  - Atendimento à Portaria 1.129/2023 do MJSP
  - Integração com obrigações de segurança pública
  - Auditoria e logs de registros

- **Interface de Configuração**
  - Página de configuração da integração FNRH
  - Teste de conexão com a API
  - Configuração de estabelecimento no FNRH
  - Ativação/desativação da integração

- **Tratamento de Erros**
  - Validação de dados antes do envio
  - Retry automático com backoff exponencial
  - Notificações de falhas
  - Logs detalhados de erros

#### 📝 Tarefas Detalhadas

##### Fase 1: Configuração e Autenticação
- [ ] Criar tabela de configurações FNRH (`fnrh_settings`)
- [ ] Implementar autenticação com API FNRH Digital
- [ ] Criar interface de configuração no Settings
- [ ] Implementar teste de conexão

##### Fase 2: Integração com Check-in
- [ ] Criar hook `useFNRH` para comunicação com API
- [ ] Integrar envio automático no processo de check-in
- [ ] Validar dados obrigatórios antes do envio
- [ ] Criar tabela de logs de registros FNRH (`fnrh_registrations`)

##### Fase 3: Interface e Gestão
- [ ] Criar página de gestão de registros FNRH
- [ ] Visualizar histórico de registros enviados
- [ ] Implementar retry manual de registros falhados
- [ ] Dashboard com estatísticas de registros

##### Fase 4: Conformidade e Auditoria
- [ ] Implementar logs detalhados
- [ ] Criar relatórios de conformidade
- [ ] Validação de dados conforme legislação
- [ ] Documentação de conformidade legal

#### 🔗 Referências
- Manual Técnico: `Manual API FNRH Digital.pdf`
- Legislação: Decreto 5.123/2004, Portaria MJSP 1.129/2023

---

## 🎯 Fase 4: Avançado (Opcional)

### ✅ Objetivos
- Integrações reais com OTAs
- Funcionalidades avançadas
- Otimizações

---

## 📈 Progresso

### Fase 1 (MVP): Portal do Hóspede
```
Portal do Hóspede:     [██████████] 100%
Sistema de Notificações: [██████████] 100%
Check-in Online:       [██████████] 100%
Módulo Manutenção:     [██████████] 100% (Interface completa)
```

### Fase 1 (MVP): Funcionalidades Core
```
Formulários de Reserva: [██████████] 100%
Sistema Tarifário:     [██████████] 100%
Sistema de E-mails:     [██████████] 100%
Relatórios Financeiros: [░░░░░░░░░░] 0%
```

### Fase 2: Diferenciais
```
Tarifário Dinâmico:    [██████████] 100%
Channel Manager OTAs:   [░░░░░░░░░░] 0%
```

### Fase 3: Integrações Regulatórias
```
Integração FNRH Digital: [░░░░░░░░░░] 0% (Próximo módulo)
```

### Fase 4: Avançado
```
Integrações OTAs:      [░░░░░░░░░░] 0%
Funcionalidades Avançadas: [░░░░░░░░░░] 0%
```

---

## 🔗 Links Úteis

- [Documentação Detalhada](./PROXIMOS_PASSOS.md)
- [Supabase Docs](https://supabase.com/docs)
- [shadcn/ui Docs](https://ui.shadcn.com)

---

## 📝 Notas de Implementação

### Tecnologias Utilizadas
- **Frontend:** React + TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (PostgreSQL, RLS, RPC Functions)
- **Estado:** React Query para cache e sincronização
- **i18n:** react-i18next para internacionalização
- **Data:** date-fns para manipulação de datas

### Melhorias de UX/UI Implementadas
- Design mobile-first responsivo
- Microinterações e animações suaves
- Skeleton loading states
- Feedback visual em todas as ações
- Estados vazios amigáveis
- Tipografia moderna (Inter/SF Pro)
- Ícones outline (Lucide)
- Gradientes leves e elegantes
- Cards com cantos arredondados (12-16px)
- Sombras suaves e profundidade visual

---

---

## 📊 Resumo de Implementações

### ✅ Funcionalidades Completas
1. **Portal do Hóspede** - 100% completo
2. **Sistema de Notificações** - 100% completo
3. **Check-in Online** - 100% completo
4. **Módulo de Manutenção** - 100% completo (admin + hóspede)
5. **Formulários de Reserva** - 100% completo
6. **Sistema Tarifário Dinâmico** - 100% completo
7. **Sistema de E-mails** - 100% completo (13 tipos de eventos, 5 provedores)

### ⏳ Funcionalidades Pendentes
1. **Integração FNRH Digital** - Próximo módulo a ser implementado
2. **Relatórios Financeiros** - Pendente
3. **Channel Manager OTAs** - Pendente

### 📈 Progresso Geral do MVP
```
MVP Essencial:         [█████████░] 90%
Fase 2 (Diferenciais): [████░░░░░░] 40%
Fase 3 (Avançado):     [░░░░░░░░░░] 0%
```

---

**Atualizado em:** 2024-12-08


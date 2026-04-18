# PMS — Documentação de funcionalidades

Visão geral do sistema de gestão hoteleira (Property Management System): módulos operacionais, tarifário, financeiro, canais, motor de reservas público e painel **Super Admin**.

> **Nota:** Alguns itens dependem de permissões de cargo, da feature estar habilitada para a empresa/estabelecimento (Super Admin → Funcionalidades) ou de integrações (Stripe, Channel Manager, etc.).

---

## 1. Arquitetura e acesso

| Conceito | Descrição |
|----------|-----------|
| **Multi-tenant** | Usuários vinculados a **empresas** (`companies`) e **estabelecimentos** (`establishments`). |
| **Rotas do PMS** | A maior parte do painel usa `/:establishmentId/...` (ID numérico ou slug conforme contexto). |
| **Autenticação** | Login (`/login`), recuperação de senha, sessão persistida (Supabase Auth). |
| **Papéis (employees)** | Ex.: gerente, vendas, financeiro, operador, housekeeping, manutenção — com permissões JSON por módulo. |
| **Super Admin** | Usuários em `admin_users` com acesso ao painel global (`/super-admin` ou `/admin-dashboard`). |
| **Hóspede** | Áreas públicas: web check-in, pagamentos, motor de reservas, políticas — sem necessidade de login de staff. |

---

## 2. Navegação principal (sidebar)

Itens típicos do menu lateral (podem ser ocultados por permissão ou feature):

| Item | Rota (padrão) | Função resumida |
|------|-----------------|-----------------|
| **Dashboard** | `/:id/` | KPIs do dia, ocupação, receita, gráficos, alertas, reservas recentes. |
| **Dashboard Proprietário** | `/:id/proprietario` | Visão para proprietário (métricas e indicadores dedicados). |
| **Mapa de ocupação** | `/:id/ocupacao` | Calendário visual de quartos × datas, reservas, bloqueios, manutenção, limpeza. |
| **Mapa de disponibilidades** | `/:id/disponibilidade` | Disponibilidade por categoria/data (feature `availability_map`). |
| **Reservas** | `/:id/reservas` | Lista, criação, edição, calendário, bloqueios, trocas de quarto, etc. |
| **Orçamentos** | `/:id/orcamentos` | Fluxo de orçamentos/cotações. |
| **Clientes** | `/:id/clientes` | Cadastro e gestão de clientes. |
| **Unidades** | `/:id/unidades` | Prédios, categorias, quartos, configurações de inventário. |
| **Financeiro** | `/:id/financeiro` | Relatórios, contas a receber/pagar, faturas, conciliação, portadores, taxas. |
| **Tarifário (sistema tarifário)** | `/:id/tarifario` | **PMS Rate System** — mapa de tarifas, ARI, planos, restrições, políticas de cancelamento, analytics. |
| **Manutenção** | `/:id/manutencao` | Tickets de manutenção por quarto. |
| **Avaliações** | `/:id/avaliacoes` | Stay reviews / feedback de hóspedes. |
| **Channel Manager** | `/:id/channel-manager` | Integração e sincronização com canais OTA. |
| **Logs de atividade** | `/:id/logs` | Auditoria de ações (gerentes / super admin). |
| **Mensagens & Cobranças** | `/:id/cobranca-checkin` | WhatsApp / Chatwoot / Evolution / webhook — cobrança, lembretes, resumo do dia. |
| **Configurações** | `/:id/configuracoes` | Dados do hotel, horários, serviços, políticas, Stripe, cupons, exibição de quartos. |
| **Funcionários** | `/:id/funcionarios` | Cargos e permissões (geralmente restrito a gerente). |
| **Minhas empresas** | `/user-dashboard` | Escolha de empresa/estabelecimento após login. |
| **Documentação** | `/documentation` ou `/:id/documentation` | Conteúdo de ajuda interna. |

**Tarifário legado:** existe rota `/:id/tarifario-legado` apontando para a página de precificação antiga (`Pricing`).

---

## 3. Dashboard (`Dashboard`)

- **Faturamento hoje** (com variação vs. dia anterior, quando houver histórico).
- **Taxa de ocupação** (quartos ocupados vs. total).
- **Check-ins do dia** (inclui pendentes).
- **RevPAR** (receita por quarto disponível).
- **Gráficos:** histórico de ocupação e de receita.
- **Alertas** operacionais (quando aplicável).
- **Reservas recentes** para acesso rápido.

---

## 4. Mapa de ocupação (`OccupancyMap`)

- Visualização **por quarto e data** (grade/calendário).
- Estados de reserva, **bloqueio** de unidade, **manutenção**, limpeza, check-in/check-out do dia.
- Ações contextuais: nova reserva, bloqueio, desbloqueio, visualização de reserva, etc.
- Integração com regras de **overbooking** e notificações conforme configuração.

---

## 5. Mapa de disponibilidades (`AvailabilityMap`)

- Foco em **disponibilidade por categoria** (e quartos) ao longo do tempo.
- Útil para análise de estoque disponível sem a granularidade operacional completa do mapa de ocupação.

---

## 6. Reservas (`Reservations` / `ReservationDetails`)

- Listagem com filtros, busca, status (confirmada, pendente, pré-reserva, cancelada, etc.).
- **Pré-reservas** com `expiration_date` e fluxo automático de cancelamento ao expirar.
- **Pendências** (`/:id/reservas/pendencias`): fila de reservas que precisam atenção.
- Detalhe da reserva: hóspedes, pagamentos, quarto, tarifas, políticas, documentos, histórico.
- Integração com **Stripe**, **cupons**, **políticas de cancelamento** e **serviços**.
- **Web check-in** (link público por localizador).
- **Calendário de reservas** (componente de mapa/calendário na própria área de reservas).

---

## 7. Orçamentos (`Quotes`)

- Criação e acompanhamento de **orçamentos** com fluxo próprio de pagamento e seleção de quarto (`/quote-payment/...`, `/quote-room-selection/...`).

---

## 8. Clientes (`Clients`)

- Cadastro completo (contato, documentos, histórico).
- **Centralização / deduplicação** (`/:id/clientes/centralizacao`): mesclar duplicados por CPF, e-mail ou telefone (feature `client_deduplication`).

---

## 9. Unidades (`Units`)

- **Prédios**, **categorias de quartos**, **quartos** (número, nome, status, bloqueio).
- Configurações que alimentam disponibilidade, tarifário e motor de reservas.

---

## 10. Financeiro (`Financial`)

Abas principais:

| Aba | Conteúdo |
|-----|----------|
| **Visão geral** | Resumo do período, gráficos de receita, canais, caixa. |
| **Contas a receber** | Contas a receber vinculadas a reservas/pagamentos. |
| **Contas a pagar** | Despesas e títulos a pagar. |
| **Faturas** | Gestão de faturas. |
| **Conciliação** | Conciliação bancária. |
| **Estornos** | Lista e tratamento de estornos. |
| **Pagamentos** | Visão consolidada de pagamentos. |
| **Portadores** | Portadores e tipos de pagamento (cartão, PIX, etc.). |
| **Taxas** | Taxas de serviço e encargos configuráveis. |
| **Relatórios** | Inclui relatórios de **cancelamento**, **no-show**, fechamento de caixa, exportação (CSV/XLSX), etc. |

---

## 11. Sistema tarifário — PMS Rate System (`PMSRateSystem`)

Rota: `/:establishmentId/tarifario`.

### Abas e áreas

| Área | Descrição |
|------|-----------|
| **Dashboard (preços)** | `PriceDashboardView` — visão analítica de preços/ocupação conforme implementação. |
| **Mapa de tarifas** | `RateCalendarGrid` — calendário de tarifas por plano/categoria/dia. |
| **Grade ARI** | `ARIGrid` — grade tipo **ARI** (Availability / Rate / Inventory) para edição em massa. |
| **Planos** | `RatePlansView` — CRUD de **planos tarifários** (BAR, pacotes, rótulos para motor, etc.). |
| **Configuração → Tipos de planos** | `PlanTypesView` — tipologia dos planos. |
| **Configuração → Políticas de cancelamento** | `CancellationPolicies` — regras de multa, no-show, pré-pagamento. |
| **Configuração → Regras dinâmicas** | `DynamicRulesView` — automação de preço (requer feature **Automação de regras de precificação dinâmica**). |
| **Restrições** | `RestrictionsView` — min/max LOS, CTA/CTD, stop sell, etc. |
| **Analytics** | `RateAnalyticsView` — métricas do tarifário. |

### Ações globais (header)

- **Recalcular agora** — recálculo de preços dinâmicos (Edge Function `recalc-rates`, quando a feature está liberada).
- **Sincronizar canais** — diálogo de sync com channel manager.
- **Configurações** — parâmetros do sistema tarifário (`RateSystemSettingsDialog`).

### Tarifário legado

- Rota `/:id/tarifario-legado` — interface antiga de precificação (`Pricing`).

---

## 12. Manutenção (`Maintenance`)

- **Tickets** por quarto: abertura, prioridade, status, anexos, comentários (equipe e hóspede em fluxos integrados).
- Integração com mapa de ocupação e notificações.

---

## 13. Avaliações de estadia (`StayReviews`)

- Coleta e gestão de **reviews** pós-estadia (rotas públicas de agradecimento/avaliação conforme configuração).

---

## 14. Channel Manager (`ChannelManager`)

- Sincronização de **inventário e tarifas** com OTAs/canais conectados.
- Depende de integrações e credenciais configuradas.

---

## 15. Logs de atividade (`ActivityLogs`)

- Registro de ações relevantes para **auditoria** (quem alterou o quê), com foco em conformidade operacional.

---

## 16. Mensagens & Cobranças (`CheckinChargeSettings`)

- Canal: **WhatsApp Cloud API**, **Chatwoot**, **Evolution API** ou **Webhook**.
- Templates (internos, Meta ou Canned Responses do Chatwoot).
- Envio de **cobrança com link Stripe**, **lembretes de check-in/checkout**, **mensagens personalizadas**.
- **Resumo do dia** para Chatwoot (conversa/grupo) ou números extras no WhatsApp: checkouts do dia, manutenções e bloqueios criados.
- **Automação** do resumo com horário (Brasília) + função agendada `send-daily-digest-schedule`.
- Página de **ajuda** (`/:id/cobranca-checkin/ajuda`).

---

## 17. Configurações do estabelecimento (`Settings`)

| Aba | Conteúdo |
|-----|----------|
| **Informações do hotel** | Nome, endereço, contatos, mídia, tipo de hotel. |
| **Horário e pagamento** | Check-in/out, fuso, regras de pagamento automático OTA. |
| **Serviços** | Serviços opcionais do estabelecimento. |
| **Políticas** | Políticas internas e textos. |
| **Exibição de quartos** | Ordem e regras no motor / listagens. |
| **Descontos** | **Cupons** e histórico de uso. |
| **Integrações** | APIs e chaves (quando feature habilitada). |
| **Stripe** | Conta Connect / chaves por estabelecimento, pagamentos online. |

---

## 18. Funcionários (`Employees`)

- Gestão de **cargos** (`employee_roles`) e **permissões** granulares.
- Vínculo usuário ↔ estabelecimento.

---

## 19. Motor de reservas (público)

| Rota / área | Descrição |
|-------------|-----------|
| `/motor`, `/motor/:companySlug` | **Booking engine** — busca por datas, categorias, planos tarifários, confirmação. |
| `/motor/.../categoria/:categoryId` ou `/categoria/:categoryId` | Detalhe de categoria (domínio customizado). |
| `/motor/.../reserva/:id` ou `/reserva/:id` | Detalhe da reserva criada no motor. |
| `/reservar/:establishmentSlug` | **Reserva pública** por estabelecimento (fluxo `PublicReservation`). |
| **Custom domain** | `CustomDomainDetector` na raiz `/` para apontar domínio da empresa ao motor. |
| **Configuração global** | `/motor-reservas/configuracoes` — temas, domínio, estabelecimentos no motor, SEO. |

Funcionalidades de produto (habilitadas pelo Super Admin): motor ativo, temas, domínio customizado, customização avançada, etc.

---

## 20. Página pública de reservas (configuração)

- Rota `/pagina-publica/configuracoes` — quais estabelecimentos da empresa têm **página pública** ativa (`company_public_reservation_establishments`).

---

## 21. Web check-in e hóspede

| Rota | Uso |
|------|-----|
| `/web-checkin/:locator` | Fluxo de **web check-in** (dados, políticas, documentos). |
| `/guest-dashboard` | Área do hóspede logado. |
| `/payment/:paymentIntentId` | Pagamento Stripe (lazy load). |
| `/payment/checkin/:token` | Pagamento vinculado a cobrança de check-in. |
| `/payment/success/...` | Retorno de pagamento bem-sucedido. |
| `/review/:locator`, `/thank-you` | Avaliação pós-estadia / agradecimento. |
| `/policies/...` | Aceite de políticas com token. |
| `/motor/.../politica/:policyId`, `/politica/:policyId` | Texto público de **política de cancelamento**. |

---

## 22. Super Admin (`SuperAdmin`)

Rotas: `/super-admin` ou `/admin-dashboard` (mesmo conteúdo, exige `SuperAdminRoute`).

### Abas principais

| Aba | Função |
|-----|--------|
| **Visão geral** | KPIs, gráficos (empresas, estabelecimentos, usuários, tendências). |
| **Empresas** | CRUD de **companies**, CNPJ, contato, status, slugs, tema do motor, limites. |
| **Usuários** | Gerentes/usuários e **super admins**; limites de empresas/estabelecimentos por usuário. |
| **Associações** | Vínculos **user ↔ company** (`user_companies`). |
| **Estabelecimentos** | Lista e gestão de **establishments** (vínculo com empresa, IDs numéricos/slugs). |
| **E-mails** | **Templates**, **configurações SMTP/API**, **fila** e **logs** de e-mail (componentes `EmailTemplatesManager`, `EmailSettingsManager`, `EmailLogsManager`, `EmailQueueManager`). |
| **Site** | **Site settings** globais: título, meta, OG, logo, favicon, URL base do PMS, logs de console. |
| **Funcionalidades** | **Feature flags** por produto: orçamentos, reserva pública, mapa de disponibilidades, motor de reservas, temas, domínio customizado, customização avançada, **Mensagens & Cobranças**, automação de precificação dinâmica, centralização de clientes, recomendações de preço, etc. — com escopo **global**, por **empresa** ou por **estabelecimento** conforme o caso. |
| **Stripe** | Configuração global Stripe (chaves, webhooks em nível de produto). |

### Outros elementos comuns no Super Admin

- **Validação de slug** para empresas/estabelecimentos.
- **Stripe** — diálogos de configuração global e integração com assinaturas/pagamentos.
- Gráficos com **Recharts** (barras, pizza) na visão geral.

---

## 23. Dashboard do proprietário (`OwnerDashboard`)

- Indicadores voltados ao **proprietário** do negócio (receita, ocupação, comparativos — conforme implementação do hook/página).

---

## 24. Documentação interna (`Documentation`)

- Páginas de ajuda e referência para usuários do PMS (conteúdo estático/estruturado na aplicação).

---

## 25. Integrações e backend (resumo)

- **Supabase:** Postgres, Auth, Storage, **Edge Functions** (Stripe webhook, e-mail, `calculate_rate_price` via RPC, `recalc-rates`, lembretes de checkout, cobrança de check-in, resumo diário, etc.).
- **Stripe:** Pagamentos, PaymentIntents, Connect por estabelecimento.
- **Monitoramento:** `monitoring` no `App` (intervalo configurável).

---

## 26. Internacionalização

- **i18n** (`react-i18next`) — interface com traduções (ex.: `pt-BR`, `en`, `es`) em várias telas.

---

*Documento gerado com base na estrutura de rotas (`App.tsx`), menu (`Sidebar.tsx`) e páginas principais do repositório. Para detalhes de API e migrations, consulte `supabase/migrations` e `supabase/functions`.*

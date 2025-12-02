# 🔗 Diagrama de Dependências - Funcionalidades

## Dependências entre Módulos

```
┌─────────────────────────────────────────────────────────────┐
│                    BANCO DE DADOS (Supabase)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Reservas  │  │Quartos   │  │Clientes  │  │Pagamentos│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │Manutenção│  │Categorias│  │Tarifas   │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    CORE FUNCTIONALITIES                     │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  RESERVAS    │    │ MANUTENÇÃO   │    │  FINANCEIRO   │
│              │    │              │    │              │
│ ┌──────────┐ │    │ ┌──────────┐ │    │ ┌──────────┐ │
│ │Formulário│ │    │ │Tickets   │ │    │ │Relatórios│ │
│ │Validação │ │    │ │Status    │ │    │ │Gráficos │ │
│ │Cálculo   │ │    │ │Alertas   │ │    │ │Exportação│ │
│ └──────────┘ │    │ └──────────┘ │    │ └──────────┘ │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              FEATURES AVANÇADAS (Dependem do Core)         │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  TARIFÁRIO   │    │ CHANNEL      │    │  OTAs        │
│  DINÂMICO    │    │  MANAGER     │    │  INTEGRATION │
│              │    │              │    │              │
│ ┌──────────┐ │    │ ┌──────────┐ │    │ ┌──────────┐ │
│ │Temporadas│ │    │ │Config OTA│ │    │ │Booking   │ │
│ │Regras    │ │    │ │Sync      │ │    │ │Airbnb    │ │
│ │Promoções │ │    │ │Tarifas   │ │    │ │Expedia   │ │
│ └──────────┘ │    │ └──────────┘ │    │ └──────────┘ │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  DASHBOARD   │
                    │  INTEGRADO   │
                    └──────────────┘
```

## Ordem Recomendada de Implementação

### 1️⃣ Base (Semana 1-2)
```
Reservas → Manutenção → Financeiro Básico
```
**Por quê?** Essas são as funcionalidades core que outras dependem.

### 2️⃣ Diferenciais (Semana 3-4)
```
Tarifário Dinâmico → Channel Manager
```
**Por quê?** O tarifário melhora as reservas. O Channel Manager depende de reservas e tarifário.

### 3️⃣ Avançado (Semana 5+)
```
Integrações OTA → Otimizações → Features Avançadas
```

## Dependências Específicas

### Reservas depende de:
- ✅ Clientes (já implementado)
- ✅ Categorias/Quartos (já implementado)
- ⏳ Validação de disponibilidade (a implementar)
- ⏳ Cálculo de preços (a implementar)

### Tarifário depende de:
- ✅ Categorias (já implementado)
- ⏳ Reservas (para calcular ocupação)
- ⏳ Sistema de datas (a implementar)

### Manutenção depende de:
- ✅ Quartos (já implementado)
- ⏳ Status de quartos (a implementar)
- ⏳ Reservas (para validar conflitos)

### Financeiro depende de:
- ⏳ Reservas (para faturamento)
- ⏳ Pagamentos (já tem tabela)
- ⏳ Channel Manager (para relatórios de OTAs)

### Channel Manager depende de:
- ⏳ Reservas (para sincronizar)
- ⏳ Tarifário (para precificar por canal)
- ⏳ Quartos (para disponibilidade)

## Bloqueadores

### ⚠️ Bloqueadores Críticos
- **Reservas** bloqueia: Tarifário, Channel Manager, Financeiro completo
- **Manutenção** bloqueia: Reservas (validação de quartos)

### ⚠️ Bloqueadores Parciais
- **Tarifário** melhora: Reservas, Channel Manager
- **Channel Manager** melhora: Financeiro (relatórios de OTAs)

## Decisões de Arquitetura

### ✅ Já Implementado
- Schema do banco de dados
- Autenticação
- Estrutura base de componentes
- Integração Supabase configurada

### ⏳ A Implementar
- Lógica de negócio (validações, cálculos)
- Integrações entre módulos
- Sincronização de dados
- APIs externas (OTAs)

---

**Última atualização:** 2024-11-11


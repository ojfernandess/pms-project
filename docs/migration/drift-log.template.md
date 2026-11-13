# Registo de drift (template)

Copie este ficheiro para `drift-log.md` (ou use fora do git) e preencha após correr [cloud-validation.md](./cloud-validation.md).

**Ambiente:** staging | produção  
**Data da verificação:** YYYY-MM-DD  
**Quem:** nome ou equipa  
**Project ref Supabase:** `…` (opcional)

## Resumo

| Métrica | Valor na cloud | Valor esperado (inventário local) | OK? |
| --- | --- | --- | --- |
| Funções em `public` (`pg_proc` / `prokind = f`) | | ver [sql-rpc-inventory.md](./sql-rpc-inventory.md) | |
| Políticas RLS (`pg_policies`) | | ver [rls-policies-inventory.md](./rls-policies-inventory.md) | |
| Tabelas `public` com RLS activo | | — | |
| Triggers não internos (`public` + `auth`) | | ver [triggers-inventory.md](./triggers-inventory.md) | |
| Jobs `cron.job` (se `pg_cron`) | | ver [pg-cron-inventory.md](./pg-cron-inventory.md) | |

## Entradas detalhadas

### [ID-001] Título curto

| Campo | Valor |
| --- | --- |
| Tipo | função \| policy \| trigger \| cron \| edge function \| outro |
| Nome do objecto | |
| Esquema / tabela | |
| Comportamento na cloud | |
| Comportamento esperado (migração / doc) | `ficheiro.sql` ou link |
| Impacto | bloqueante \| baixo \| médio \| alto |
| Próximo passo | ex.: gerar migração, alinhar dashboard, documentar excepção |

---

_Adicione mais blocos `[ID-002]` conforme necessário._

## Excepções aceites (documentadas)

Lista de diferenças **intencionais** entre cloud e repo (ex.: hotfix só em produção até migração):

- …

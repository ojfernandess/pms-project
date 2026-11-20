# StayOS CRM — Etapa 4 (Campanhas)

## Entrega

- Tabelas `crm_segments`, `crm_campaigns`, `crm_campaign_recipients`
- UI: `/crm/segmentos`, `/crm/campanhas`
- Consentimento marketing em Perfil 360 (opt-in por canal)
- Recipients respeitam segmento + `crm_consent` (`purpose=marketing`)
- Fila BullMQ `crm` / job `campaign.send` (worker)

## Fluxo

1. Criar segmento (regras JSON: `has_email`, `source_in`, `tag_any`, …)
2. Criar campanha (canal email/whatsapp/sms + segmento)
3. **Recipients** → monta lista (pula sem consentimento/endereço)
4. **Enfileirar** → `CrmCampaignQueueService` → worker processa batches

## Observação

O job marca recipients como `sent` de forma controlada na etapa 4 (sem segundo WhatsApp). Dispatch real de canal reutiliza Mensagens & Cobranças / e-mail na etapa 5.

## Próxima etapa

**5** — Automações (triggers/conditions/actions) + templates iniciais → ver `ETAPA5_AUTOMATIONS.md`

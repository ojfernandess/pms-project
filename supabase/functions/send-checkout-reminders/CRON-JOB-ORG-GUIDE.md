# Guia Completo: Configurar Cron Job no cron-job.org

Este guia mostra como configurar a execução automática diária da Edge Function `send-checkout-reminders` usando o serviço gratuito [cron-job.org](https://cron-job.org).

## Passo 1: Criar Conta no cron-job.org

1. Acesse [https://cron-job.org](https://cron-job.org)
2. Clique em **"Sign up"** ou **"Register"**
3. Preencha o formulário de registro:
   - Email
   - Senha
   - Confirmação de senha
4. Confirme seu email (verifique a caixa de entrada)
5. Faça login na sua conta

## Passo 2: Obter Credenciais do Supabase

Antes de configurar o cron job, você precisa das seguintes informações:

### 2.1. URL da Edge Function
```
https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders
```

### 2.2. Anon Key ou Service Role Key

**Opção A: Usar Anon Key (Recomendado para segurança)**
1. Acesse o Supabase Dashboard
2. Vá em **Settings** > **API**
3. Copie a **"anon public"** key (não a service_role key)

**Opção B: Usar Service Role Key (Mais permissões, use com cuidado)**
1. Acesse o Supabase Dashboard
2. Vá em **Settings** > **API**
3. Copie a **"service_role"** key (mantenha segura!)

## Passo 3: Criar o Cron Job

1. Após fazer login no cron-job.org, clique em **"Create cronjob"** ou **"New cronjob"**

2. Preencha os campos:

### Informações Básicas
- **Title**: `Checkout Reminders - PMS`
- **Address**: `https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders`
- **Method**: Selecione **POST**

### Headers (Importante!)
Clique em **"Add Header"** e adicione os seguintes headers:

**Header 1:**
- **Name**: `Authorization`
- **Value**: `Bearer SUA_ANON_KEY_AQUI` (substitua pela sua Anon Key)

**Header 2:**
- **Name**: `Content-Type`
- **Value**: `application/json`

### Request Body
No campo **"Request body"** ou **"Body"**, cole:
```json
{
  "days": 1
}
```

### Schedule (Agendamento)
Configure quando o job deve executar:

**Opção 1: Diariamente às 09:00 (Recomendado)**
- Selecione **"Daily"**
- Configure o horário: **09:00** (ou o horário desejado)
- Selecione o fuso horário: **UTC** ou **America/Sao_Paulo** (BRT)

**Opção 2: Usando Expressão Cron**
- Selecione **"Cron expression"**
- Digite: `0 9 * * *` (executa diariamente às 09:00 UTC)
- Para BRT (UTC-3), use: `0 12 * * *` (09:00 BRT = 12:00 UTC)

### Opções Adicionais
- **Activate cronjob**: ✅ Marque esta opção para ativar
- **Save response**: Opcional (útil para debug)
- **Timeout**: 60 segundos (padrão)

3. Clique em **"Create cronjob"** ou **"Save"**

## Passo 4: Testar o Cron Job

### Teste Manual
1. Na lista de cron jobs, encontre o job criado
2. Clique no botão **"Run now"** ou **"Execute now"**
3. Aguarde alguns segundos
4. Clique em **"Logs"** ou **"History"** para ver o resultado

### Verificar Resposta
A resposta deve ser algo como:
```json
{
  "success": true,
  "sent": 5,
  "errors": 0,
  "total": 5
}
```

## Passo 5: Monitorar Execuções

1. Acesse a página do seu cron job
2. Vá na aba **"Logs"** ou **"History"**
3. Verifique:
   - Status das execuções (sucesso/erro)
   - Tempo de resposta
   - Resposta da API

### Logs de Sucesso
- Status: `200 OK`
- Resposta contém `"success": true`

### Logs de Erro
Se houver erro, verifique:
- Status code (400, 401, 500, etc.)
- Mensagem de erro na resposta
- Verifique se a Anon Key está correta
- Verifique se a URL está correta

## Configuração Avançada

### Enviar para Estabelecimento Específico

Se quiser enviar lembretes apenas para um estabelecimento específico, modifique o body:

```json
{
  "days": 1,
  "establishment_id": "uuid-do-estabelecimento"
}
```

### Alterar Dias Antes do Check-out

Para enviar lembretes 2 dias antes do check-out:

```json
{
  "days": 2
}
```

### Múltiplos Horários

Para enviar lembretes em múltiplos horários (ex: manhã e tarde):

1. Crie um segundo cron job
2. Configure o mesmo endereço e headers
3. Configure um horário diferente (ex: 15:00)
4. Ambos os jobs executarão independentemente

## Troubleshooting

### Erro 401 (Unauthorized)
- **Causa**: Anon Key incorreta ou ausente
- **Solução**: Verifique se o header `Authorization` está correto

### Erro 404 (Not Found)
- **Causa**: URL da Edge Function incorreta
- **Solução**: Verifique se a Edge Function foi deployada e a URL está correta

### Erro 500 (Internal Server Error)
- **Causa**: Erro na Edge Function
- **Solução**: 
  - Verifique os logs da Edge Function no Supabase Dashboard
  - Verifique se o template de e-mail está ativo
  - Verifique se as configurações de e-mail estão ativas

### Nenhum E-mail Enviado
- **Causa**: Não há reservas com check-out próximo
- **Solução**: 
  - Verifique se existem reservas confirmadas
  - Verifique se as reservas têm check-out na data configurada
  - Verifique se as reservas têm e-mail do hóspede cadastrado

### E-mails Duplicados
- **Causa**: Múltiplos cron jobs configurados ou execução manual durante o mesmo dia
- **Solução**: A Edge Function já previne duplicatas (não envia mais de uma vez por dia), mas verifique se não há múltiplos jobs configurados

## Exemplo de Configuração Completa

```
Title: Checkout Reminders - PMS
Address: https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders
Method: POST

Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Content-Type: application/json

Body:
{
  "days": 1
}

Schedule: Daily at 09:00 UTC
Status: Active
```

## Dicas Importantes

1. **Segurança**: Use a Anon Key, não a Service Role Key (a menos que necessário)
2. **Backup**: Configure um segundo cron job em outro horário como backup
3. **Monitoramento**: Verifique os logs regularmente (semanalmente)
4. **Testes**: Teste manualmente antes de ativar o agendamento automático
5. **Notificações**: Configure notificações por email no cron-job.org para receber alertas de falhas

## Limites do Plano Gratuito

O plano gratuito do cron-job.org permite:
- Até 2 cron jobs simultâneos
- Execução a cada 1 hora (mínimo)
- Histórico de logs limitado

Para mais recursos, considere o plano pago.

## Alternativas

Se precisar de mais recursos ou preferir outra solução:

1. **EasyCron** (https://www.easycron.com) - Similar ao cron-job.org
2. **GitHub Actions** - Se o projeto estiver no GitHub
3. **Vercel Cron** - Se estiver usando Vercel
4. **pg_cron** - Se disponível no seu plano Supabase

---

**Pronto!** Seu cron job está configurado e executará automaticamente todos os dias para enviar lembretes de check-out aos hóspedes.


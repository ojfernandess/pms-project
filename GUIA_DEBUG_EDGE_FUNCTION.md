# 🔍 Como Verificar Erros da Edge Function

## 📊 Ver Logs da Edge Function

### No Supabase Dashboard:

1. Acesse [https://app.supabase.com](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Edge Functions**
4. Clique na função **send-email-smtp**
5. Clique na aba **"Logs"** ou **"Invocations"**
6. Veja os erros detalhados

### Erros Comuns:

#### 1. "Module not found" ou "Import error"
- A biblioteca SMTP não foi encontrada
- Solução: A biblioteca pode ter mudado de URL

#### 2. "Connection timeout"
- Não consegue conectar ao servidor SMTP
- Verifique host e porta

#### 3. "Authentication failed"
- Credenciais incorretas
- Para Gmail, use App Password

#### 4. "TLS/SSL error"
- Problema com certificado SSL
- Tente porta 465 (SSL) ou 587 (TLS)

## 🔧 Solução Rápida: Usar Resend/SendGrid

Se a Edge Function continuar dando erro, a solução mais rápida é usar um provedor que funciona do frontend:

1. **Resend** (Recomendado)
   - Grátis até 3.000 e-mails/mês
   - API Key direta
   - Sem Edge Function necessária

2. **SendGrid**
   - Grátis até 100 e-mails/dia
   - API Key direta

3. **Mailgun**
   - Grátis até 5.000 e-mails/mês (primeiros 3 meses)

## 📝 Como Mudar para Resend

1. Acesse **SuperAdmin > E-mails > Configurações**
2. Mude o **Provedor** de "SMTP" para **"Resend"**
3. Configure:
   - API Key do Resend
   - E-mail do remetente (deve ser de domínio verificado)
4. Teste

---

**Dica:** Resend é mais fácil e confiável que SMTP para a maioria dos casos!


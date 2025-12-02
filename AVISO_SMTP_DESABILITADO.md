# ⚠️ SMTP Desabilitado - Use Resend/SendGrid/Mailgun

## 🚨 Problema Identificado

O SMTP via Edge Function do Supabase **não está funcionando** devido a incompatibilidades entre as bibliotecas SMTP disponíveis para Deno e a versão do runtime do Supabase.

### Erro Encontrado:
```
DenoStdInternalError: bufio: caught error from `readSlice()` without `partial` property
```

Este erro indica que a biblioteca SMTP (`smtp@v0.7.0`) usa uma versão antiga do Deno std (`0.81.0`) que é incompatível com a versão atual do Supabase (`0.168.0`).

## ✅ Solução: Use Resend, SendGrid ou Mailgun

Estes provedores funcionam **diretamente do frontend**, sem necessidade de Edge Functions, e são **muito mais confiáveis**.

### 🎯 Resend (Recomendado)

**Vantagens:**
- ✅ Funciona diretamente do frontend
- ✅ Grátis até 3.000 e-mails/mês
- ✅ Fácil configuração
- ✅ API moderna e confiável
- ✅ Sem necessidade de Edge Function

**Como configurar:**
1. Acesse [https://resend.com](https://resend.com)
2. Crie uma conta gratuita
3. Vá em **API Keys** e crie uma nova chave
4. No PMS: **SuperAdmin > E-mails > Configurações**
5. Selecione **Resend** como provedor
6. Cole a API Key
7. Configure o e-mail do remetente (use domínio verificado ou o de teste)
8. Teste!

### 📧 SendGrid

**Vantagens:**
- ✅ Funciona diretamente do frontend
- ✅ Grátis até 100 e-mails/dia
- ✅ API robusta e confiável
- ✅ Sem necessidade de Edge Function

**Como configurar:**
1. Acesse [https://sendgrid.com](https://sendgrid.com)
2. Crie uma conta gratuita
3. Vá em **Settings > API Keys** e crie uma nova chave
4. No PMS: **SuperAdmin > E-mails > Configurações**
5. Selecione **SendGrid** como provedor
6. Cole a API Key
7. Configure o e-mail do remetente
8. Teste!

### 📬 Mailgun

**Vantagens:**
- ✅ Funciona diretamente do frontend
- ✅ Grátis até 5.000 e-mails/mês (primeiros 3 meses)
- ✅ API confiável
- ✅ Sem necessidade de Edge Function

**Como configurar:**
1. Acesse [https://mailgun.com](https://mailgun.com)
2. Crie uma conta
3. Vá em **Sending > API Keys** e copie sua API Key
4. No PMS: **SuperAdmin > E-mails > Configurações**
5. Selecione **Mailgun** como provedor
6. Cole a API Key
7. Configure o e-mail do remetente (deve ser do domínio verificado)
8. Teste!

## 🔄 Como Mudar de SMTP para Resend

1. **Acesse:** SuperAdmin > E-mails > Configurações
2. **Mude o Provedor:** De "SMTP" para "Resend"
3. **Configure:**
   - API Key do Resend
   - E-mail do remetente
   - Nome do remetente
4. **Ative:** Marque "Ativar Envio de E-mails"
5. **Salve** e **Teste**

## ❓ Por que SMTP não funciona?

As bibliotecas SMTP para Deno ainda estão em desenvolvimento e têm problemas de compatibilidade com diferentes versões do Deno runtime. O Supabase usa uma versão específica do Deno que não é compatível com as bibliotecas SMTP disponíveis.

## 💡 Recomendação Final

**Use Resend** - É a opção mais simples, confiável e moderna. Funciona perfeitamente do frontend sem necessidade de Edge Functions ou configurações complexas.

---

**Status:** SMTP está desabilitado no sistema. Use Resend, SendGrid ou Mailgun.


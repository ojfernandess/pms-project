# 📧 Como Configurar Domínio no Resend

## ⚠️ Problema: Domínio Não Verificado

Se você está recebendo o erro:
```
The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains
```

Isso significa que você está tentando usar um domínio de terceiros (Gmail, Outlook, etc.), mas o Resend **não permite** isso por segurança.

## ✅ Solução Rápida: Usar Domínio de Teste

Para testes rápidos, você pode usar o domínio de teste do Resend:

### Passo a Passo:

1. **No PMS:**
   - Acesse **SuperAdmin > E-mails > Configurações**
   - Provedor: **Resend**
   - **E-mail do Remetente:** `onboarding@resend.dev`
   - **Nome do Remetente:** Seu Nome
   - API Key: Sua chave do Resend
   - Clique em **Salvar**

2. **Teste:**
   - Clique em **Testar Configuração**
   - Deve funcionar! ✅

**⚠️ Limitações do Domínio de Teste:**
- E-mails podem ir para spam
- Não recomendado para produção
- Ideal apenas para testes

## 🎯 Solução para Produção: Verificar Seu Domínio

Para produção, você precisa verificar seu próprio domínio no Resend:

### Passo 1: Acessar Resend Domains

1. Acesse [https://resend.com/domains](https://resend.com/domains)
2. Faça login na sua conta
3. Clique em **"Add Domain"** ou **"Add New Domain"**

### Passo 2: Adicionar Domínio

1. Digite seu domínio (ex: `seudominio.com`)
   - ⚠️ **Não inclua** `www` ou `http://`
   - ✅ Correto: `seudominio.com`
   - ❌ Errado: `www.seudominio.com`

2. Clique em **"Add"** ou **"Continue"**

### Passo 3: Configurar DNS

O Resend fornecerá registros DNS que você precisa adicionar:

**Exemplo de registros DNS:**

```
Tipo: TXT
Nome: @
Valor: [valor fornecido pelo Resend]

Tipo: MX
Nome: @
Valor: feedback-smtp.resend.com
Prioridade: 10

Tipo: CNAME
Nome: resend._domainkey
Valor: [valor fornecido pelo Resend]
```

### Passo 4: Adicionar Registros DNS

1. Acesse o painel do seu provedor de domínio (GoDaddy, Namecheap, Cloudflare, etc.)
2. Vá em **DNS** ou **DNS Management**
3. Adicione cada registro conforme instruções do Resend
4. Aguarde a propagação DNS (pode levar de minutos a horas)

### Passo 5: Verificar Domínio

1. Volte para [resend.com/domains](https://resend.com/domains)
2. Clique em **"Verify"** ou aguarde verificação automática
3. Quando aparecer **"Verified"** ✅, está pronto!

### Passo 6: Configurar no PMS

1. **SuperAdmin > E-mails > Configurações**
2. Provedor: **Resend**
3. **E-mail do Remetente:** Use um e-mail do seu domínio verificado
   - Exemplos:
     - `noreply@seudominio.com`
     - `contato@seudominio.com`
     - `reservas@seudominio.com`
4. **Nome do Remetente:** Seu Nome ou Nome do Hotel
5. API Key: Sua chave do Resend
6. Clique em **Salvar**

## 🔍 Verificar Status do Domínio

No Resend Dashboard:
- ✅ **Verified** = Domínio verificado e pronto para uso
- ⏳ **Pending** = Aguardando verificação DNS
- ❌ **Failed** = Erro na verificação (verifique os registros DNS)

## ❓ Problemas Comuns

### "Domain verification failed"

- Verifique se os registros DNS foram adicionados corretamente
- Aguarde mais tempo para propagação DNS (pode levar até 48 horas)
- Verifique se não há erros de digitação nos registros

### "E-mails indo para spam"

- Use um domínio verificado (não o de teste)
- Configure SPF, DKIM e DMARC corretamente
- O Resend configura isso automaticamente quando você verifica o domínio

### "Não tenho um domínio próprio"

- Use o domínio de teste (`onboarding@resend.dev`) para desenvolvimento
- Para produção, você precisará de um domínio próprio
- Domínios custam cerca de R$ 30-50/ano

## 📝 Resumo

**Para Testes:**
- Use: `onboarding@resend.dev`
- Funciona imediatamente
- E-mails podem ir para spam

**Para Produção:**
- Verifique seu domínio no Resend
- Use: `seuemail@seudominio.com`
- E-mails entregues corretamente
- Melhor reputação de envio

---

**Próximo passo:** Configure o e-mail do remetente no PMS usando um domínio verificado ou o domínio de teste!


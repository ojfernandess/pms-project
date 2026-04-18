# Aplicar Migration - Storage Bucket para Documentos

## Problema
O bucket de storage "documents" não existe, causando erro ao fazer upload de documentos no web check-in.

## Solução

### Passo 1: Criar o Bucket via Supabase Dashboard

1. Acesse o Supabase Dashboard
2. Vá para **Storage** > **Buckets**
3. Clique em **"New bucket"**
4. Configure:
   - **Name**: `documents`
   - **Public**: `false` (privado) - **IMPORTANTE**: Deixe como privado
   - **File size limit**: `10485760` (10MB) ou conforme necessário
   - **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp, image/gif, application/pdf`
5. Clique em **"Create bucket"**

### Passo 2: Configurar Políticas de Acesso

Após criar o bucket, configure as políticas de acesso via Supabase Dashboard:

1. Vá para **Storage** > **Policies**
2. Selecione o bucket **"documents"** no dropdown
3. Clique em **"New Policy"** e configure cada política conforme abaixo:

---

#### 📋 Política 1: Leitura Pública (SELECT)

**Configuração no Dashboard:**
- **Policy name**: `Documents are viewable by anyone`
- **Allowed operation**: Selecione `SELECT` no dropdown
- **Target roles**: **DEIXE VAZIO** (isso permite acesso anônimo `anon` e autenticado `authenticated`)
- **USING expression**: Cole **APENAS** o texto abaixo (sem aspas, sem markdown, SEM ponto e vírgula):

```
bucket_id = 'documents'
```

**⚠️ IMPORTANTE**: 
- Não adicione ponto e vírgula (`;`) no final! O Dashboard adiciona automaticamente.
- **Target roles** deve estar **VAZIO** para permitir acesso anônimo (necessário para web check-in)

---

#### 📋 Política 2: Upload Público (INSERT) - **NECESSÁRIO para web check-in**

**⚠️ CRÍTICO**: Esta política é essencial para o web check-in funcionar!

**Configuração no Dashboard:**
- **Policy name**: `Documents are insertable by anyone`
- **Allowed operation**: Selecione `INSERT` no dropdown
- **Target roles**: **DEIXE VAZIO** (isso permite acesso anônimo `anon` e autenticado `authenticated`)
- **WITH CHECK expression**: Cole **APENAS** o texto abaixo (sem aspas, sem markdown, SEM ponto e vírgula):

```
bucket_id = 'documents'
```

**⚠️ IMPORTANTE**: 
- Não adicione ponto e vírgula (`;`) no final! O Dashboard adiciona automaticamente.
- **Target roles** deve estar **VAZIO** para permitir acesso anônimo (necessário para web check-in)
- Se você selecionar apenas `authenticated`, o web check-in não funcionará para usuários não autenticados

---

#### 📋 Política 3: Atualização (UPDATE) - Opcional

**Configuração no Dashboard:**
- **Policy name**: `Documents are updatable by authenticated users`
- **Allowed operation**: Selecione `UPDATE` no dropdown
- **Target roles**: Selecione `authenticated`
- **USING expression**: Cole **APENAS** o texto abaixo (SEM ponto e vírgula):

```
bucket_id = 'documents'
```

- **WITH CHECK expression**: Cole **APENAS** o texto abaixo (SEM ponto e vírgula):

```
bucket_id = 'documents'
```

**⚠️ IMPORTANTE**: Não adicione ponto e vírgula (`;`) no final! O Dashboard adiciona automaticamente.

---

#### 📋 Política 4: Deleção (DELETE) - Opcional

**Configuração no Dashboard:**
- **Policy name**: `Documents are deletable by authenticated users`
- **Allowed operation**: Selecione `DELETE` no dropdown
- **Target roles**: Selecione `authenticated`
- **USING expression**: Cole **APENAS** o texto abaixo (SEM ponto e vírgula):

```
bucket_id = 'documents'
```

**⚠️ IMPORTANTE**: Não adicione ponto e vírgula (`;`) no final! O Dashboard adiciona automaticamente.

---

### ⚠️ IMPORTANTE - Como Copiar Corretamente

**NÃO copie:**
- ❌ O texto markdown formatado (com `-`, `**`, etc.)
- ❌ Os títulos das seções
- ❌ As descrições dos campos

**COPIE APENAS:**
- ✅ A expressão SQL pura: `bucket_id = 'documents'`
- ✅ O nome da política: `Documents are viewable by anyone`

**Exemplo correto:**
1. Clique em "New Policy"
2. No campo "Policy name", digite: `Documents are viewable by anyone`
3. No dropdown "Allowed operation", selecione: `SELECT`
4. No campo "USING expression", cole **EXATAMENTE** isto (sem ponto e vírgula): `bucket_id = 'documents'`
5. Clique em "Save"

**❌ ERRADO**: `bucket_id = 'documents';` (com ponto e vírgula)
**✅ CORRETO**: `bucket_id = 'documents'` (sem ponto e vírgula)

### Passo 3: Verificar

Após criar o bucket e configurar as políticas:

1. Teste o upload de documentos no web check-in
2. O erro "Bucket not found" não deve mais ocorrer
3. Os arquivos devem ser salvos no bucket "documents"

## Notas Importantes

- O bucket deve ser **privado** (Public: false) para segurança
- As políticas de INSERT e SELECT devem permitir acesso anônimo (`anon`) para o web check-in funcionar
- O código já está preparado para gerar signed URLs se o bucket for privado
- O tamanho máximo do arquivo pode ser ajustado conforme necessário

## Troubleshooting

### Erro: "new row violates row-level security policy"

Este erro significa que a política de INSERT não está configurada corretamente. Verifique:

1. **A política de INSERT foi criada?**
   - Vá para Storage > Policies
   - Selecione o bucket "documents"
   - Verifique se existe uma política com operação "INSERT"

2. **Target roles está vazio?**
   - A política de INSERT deve ter "Target roles" **VAZIO** (não selecionar nada)
   - Isso permite acesso tanto para usuários anônimos (`anon`) quanto autenticados (`authenticated`)
   - ⚠️ **CRÍTICO**: Se você selecionar apenas `authenticated`, o web check-in não funcionará!

3. **WITH CHECK expression está correto?**
   - Deve ser exatamente: `bucket_id = 'documents'`
   - Sem ponto e vírgula no final
   - Sem aspas extras

4. **A política está ativa?**
   - Verifique se a política não está desabilitada
   - O status deve estar como "Active" ou "Enabled"

### Outros erros comuns:

- **"Bucket not found"**: O bucket não foi criado. Siga o Passo 1.
- **"Access denied"**: As políticas não estão configuradas corretamente. Revise o Passo 2.
- **"File too large"**: Aumente o "File size limit" do bucket.
- **"Invalid MIME type"**: Adicione o tipo MIME do arquivo nas "Allowed MIME types" do bucket.

### Verificar se as políticas estão funcionando:

1. Teste fazer upload de um arquivo pequeno (ex: uma imagem PNG)
2. Verifique os logs do console do navegador para mensagens de erro específicas
3. No Supabase Dashboard, vá para Storage > Objects e verifique se o arquivo foi salvo


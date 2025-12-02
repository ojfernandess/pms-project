# Aplicar Migration - Storage Bucket para Assets do Hotel

## Problema
O bucket de storage "hotel-assets" não existe, causando erro ao fazer upload de logo, favicon e imagens Open Graph.

## Solução

### Passo 1: Criar o Bucket via Supabase Dashboard

1. Acesse o Supabase Dashboard
2. Vá para **Storage** > **Buckets**
3. Clique em **"New bucket"**
4. Configure:
   - **Name**: `hotel-assets`
   - **Public**: `true` (público) - **IMPORTANTE**: Deixe como público para que logo, favicon e og_image sejam acessíveis
   - **File size limit**: `5242880` (5MB) ou conforme necessário
   - **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp, image/gif, image/svg+xml, image/x-icon`
5. Clique em **"Create bucket"**

### Passo 2: Configurar Políticas de Acesso

Após criar o bucket, configure as políticas de acesso via Supabase Dashboard:

1. Vá para **Storage** > **Policies**
2. Selecione o bucket **"hotel-assets"** no dropdown
3. Clique em **"New Policy"** e configure cada política conforme abaixo:

---

#### 📋 Política 1: Leitura Pública (SELECT)

**Configuração no Dashboard:**
- **Policy name**: `hotel-assets public read`
- **Allowed operation**: Selecione `SELECT` no dropdown
- **Target roles**: **DEIXE VAZIO** (isso permite acesso público)
- **USING expression**: Cole **APENAS** o texto abaixo (sem aspas, sem markdown, SEM ponto e vírgula):

```
bucket_id = 'hotel-assets'
```

**⚠️ IMPORTANTE**: 
- Não adicione ponto e vírgula (`;`) no final! O Dashboard adiciona automaticamente.
- **Target roles** deve estar **VAZIO** para permitir acesso público (necessário para logo, favicon e og_image)

---

#### 📋 Política 2: Upload Autenticado (INSERT)

**Configuração no Dashboard:**
- **Policy name**: `hotel-assets authenticated insert`
- **Allowed operation**: Selecione `INSERT` no dropdown
- **Target roles**: Selecione `authenticated` (apenas usuários autenticados podem fazer upload)
- **WITH CHECK expression**: Cole **APENAS** o texto abaixo:

```
bucket_id = 'hotel-assets'
```

---

#### 📋 Política 3: Atualização Autenticada (UPDATE)

**Configuração no Dashboard:**
- **Policy name**: `hotel-assets authenticated update`
- **Allowed operation**: Selecione `UPDATE` no dropdown
- **Target roles**: Selecione `authenticated`
- **USING expression**: Cole **APENAS** o texto abaixo:

```
bucket_id = 'hotel-assets'
```

- **WITH CHECK expression**: Cole **APENAS** o texto abaixo:

```
bucket_id = 'hotel-assets'
```

---

#### 📋 Política 4: Exclusão Autenticada (DELETE)

**Configuração no Dashboard:**
- **Policy name**: `hotel-assets authenticated delete`
- **Allowed operation**: Selecione `DELETE` no dropdown
- **Target roles**: Selecione `authenticated`
- **USING expression**: Cole **APENAS** o texto abaixo:

```
bucket_id = 'hotel-assets'
```

---

## Verificação

Após criar o bucket e as políticas:

1. Tente fazer upload de uma logo no SuperAdmin > Site
2. Verifique se o upload foi bem-sucedido
3. Verifique se a logo aparece corretamente no menu e na página de login

## Notas

- O bucket deve ser **público** para que as imagens sejam acessíveis sem autenticação
- Apenas usuários autenticados podem fazer upload, atualizar ou excluir arquivos
- O tamanho máximo de arquivo é 5MB por padrão (pode ser ajustado conforme necessário)


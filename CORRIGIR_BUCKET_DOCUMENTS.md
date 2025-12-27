# 🔧 Corrigir Erro "Bucket not found" - Fotos de Manutenção

## Problema
Ao abrir fotos enviadas pelo hóspede nos anexos de manutenção, aparece o erro:
```json
{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}
```

## Causa
O bucket `documents` não existe no Supabase Storage ou não está configurado corretamente.

## Solução

### Passo 1: Criar o Bucket no Supabase Dashboard

1. Acesse o **Supabase Dashboard**
2. Vá para **Storage** > **Buckets**
3. Clique em **"New bucket"**
4. Configure:
   - **Name**: `documents`
   - **Public**: `false` (privado) ⚠️ **IMPORTANTE**: Deixe como privado
   - **File size limit**: `10485760` (10MB)
   - **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp, image/gif, application/pdf`
5. Clique em **"Create bucket"**

### Passo 2: Configurar Políticas de Acesso

Após criar o bucket, configure as políticas de acesso:

1. Vá para **Storage** > **Policies**
2. Selecione o bucket **"documents"** no dropdown
3. Crie as seguintes políticas:

#### Política 1: Leitura (SELECT)
- **Policy name**: `Documents are viewable by anyone`
- **Allowed operation**: `SELECT`
- **Target roles**: **DEIXE VAZIO** (permite acesso anônimo e autenticado)
- **USING expression**: `bucket_id = 'documents'`

#### Política 2: Upload (INSERT)
- **Policy name**: `Documents are insertable by anyone`
- **Allowed operation**: `INSERT`
- **Target roles**: **DEIXE VAZIO** (permite acesso anônimo e autenticado)
- **WITH CHECK expression**: `bucket_id = 'documents'`

#### Política 3: Atualização (UPDATE) - Opcional
- **Policy name**: `Documents are updatable by authenticated users`
- **Allowed operation**: `UPDATE`
- **Target roles**: `authenticated`
- **USING expression**: `bucket_id = 'documents'`
- **WITH CHECK expression**: `bucket_id = 'documents'`

#### Política 4: Deleção (DELETE) - Opcional
- **Policy name**: `Documents are deletable by authenticated users`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **USING expression**: `bucket_id = 'documents'`

### Passo 3: Verificar

Após criar o bucket e configurar as políticas:

1. Recarregue a página de Manutenção
2. Tente abrir uma foto enviada pelo hóspede
3. O erro "Bucket not found" não deve mais aparecer
4. As fotos devem ser exibidas corretamente

## ⚠️ IMPORTANTE

- **Target roles** nas políticas de SELECT e INSERT deve estar **VAZIO** para permitir acesso anônimo
- Não adicione ponto e vírgula (`;`) no final das expressões SQL
- O bucket deve ser **privado** (Public: false) para segurança
- O código já está preparado para gerar signed URLs automaticamente quando o bucket for privado

## Troubleshooting

### Erro persiste após criar o bucket
1. Verifique se o bucket foi criado corretamente
2. Verifique se as políticas estão ativas
3. Limpe o cache do navegador
4. Verifique os logs do console para erros específicos

### Fotos não aparecem
1. Verifique se as políticas de SELECT estão configuradas
2. Verifique se o bucket é privado e se as signed URLs estão sendo geradas
3. Verifique os logs do console para erros de CORS ou permissões

### Upload de fotos não funciona
1. Verifique se a política de INSERT está configurada
2. Verifique se o "Target roles" está vazio (permite acesso anônimo)
3. Verifique o tamanho do arquivo (máximo 10MB)

## Notas Técnicas

- O código verifica automaticamente se o bucket existe antes de tentar gerar URLs
- Se o bucket não existir, o código usa a URL original salva no banco
- Se o bucket existir e for privado, o código gera signed URLs automaticamente
- Se o bucket existir e for público, o código usa URLs públicas diretamente


# Configurar Permissões do Bucket "maintenance" para Manutenção

## Problema
As imagens anexadas aos chamados de manutenção não estão aparecendo na página porque o bucket "maintenance" não tem as permissões corretas configuradas.

## Solução

### Passo 1: Verificar se o Bucket Existe

1. Acesse o Supabase Dashboard
2. Vá para **Storage** > **Buckets**
3. Verifique se o bucket **"maintenance"** existe
4. Se não existir, crie-o:
   - Clique em **"New bucket"**
   - **Name**: `maintenance`
   - **Public**: `true` (público) ou `false` (privado) - **Recomendado: true para facilitar visualização**
   - **File size limit**: `10485760` (10MB) ou conforme necessário
   - **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp, image/gif`
   - Clique em **"Create bucket"**

### Passo 2: Configurar Políticas de Acesso

Após criar/verificar o bucket, configure as políticas de acesso via Supabase Dashboard:

1. Vá para **Storage** > **Policies**
2. Selecione o bucket **"maintenance"** no dropdown
3. Clique em **"New Policy"** e configure cada política conforme abaixo:

---

#### 📋 Política 1: Leitura Pública (SELECT) - **ESSENCIAL**

**Esta política permite que as imagens sejam visualizadas na página de manutenção.**

**Configuração no Dashboard:**
- **Policy name**: `Maintenance images are viewable by anyone`
- **Allowed operation**: Selecione `SELECT` no dropdown
- **Target roles**: **DEIXE VAZIO** (isso permite acesso anônimo `anon` e autenticado `authenticated`)
- **USING expression**: Cole **APENAS** o texto abaixo (sem aspas, sem markdown, SEM ponto e vírgula):

```
bucket_id = 'maintenance'
```

**⚠️ IMPORTANTE**: 
- Não adicione ponto e vírgula (`;`) no final! O Dashboard adiciona automaticamente.
- **Target roles** deve estar **VAZIO** para permitir acesso público às imagens

---

#### 📋 Política 2: Upload (INSERT) - **NECESSÁRIO para anexar fotos**

**Esta política permite que hóspedes e usuários anexem fotos aos chamados.**

**Configuração no Dashboard:**
- **Policy name**: `Maintenance images are insertable by anyone`
- **Allowed operation**: Selecione `INSERT` no dropdown
- **Target roles**: **DEIXE VAZIO** (isso permite acesso anônimo `anon` e autenticado `authenticated`)
- **WITH CHECK expression**: Cole **APENAS** o texto abaixo (sem aspas, sem markdown, SEM ponto e vírgula):

```
bucket_id = 'maintenance'
```

**⚠️ IMPORTANTE**: 
- Não adicione ponto e vírgula (`;`) no final! O Dashboard adiciona automaticamente.
- **Target roles** deve estar **VAZIO** para permitir upload tanto de hóspedes quanto de usuários autenticados

---

#### 📋 Política 3: Atualização (UPDATE) - Opcional

**Configuração no Dashboard:**
- **Policy name**: `Maintenance images are updatable by authenticated users`
- **Allowed operation**: Selecione `UPDATE` no dropdown
- **Target roles**: Selecione `authenticated`
- **USING expression**: Cole **APENAS** o texto abaixo (SEM ponto e vírgula):

```
bucket_id = 'maintenance'
```

- **WITH CHECK expression**: Cole **APENAS** o texto abaixo (SEM ponto e vírgula):

```
bucket_id = 'maintenance'
```

---

#### 📋 Política 4: Deleção (DELETE) - Opcional

**Configuração no Dashboard:**
- **Policy name**: `Maintenance images are deletable by authenticated users`
- **Allowed operation**: Selecione `DELETE` no dropdown
- **Target roles**: Selecione `authenticated`
- **USING expression**: Cole **APENAS** o texto abaixo (SEM ponto e vírgula):

```
bucket_id = 'maintenance'
```

---

### ⚠️ IMPORTANTE - Como Copiar Corretamente

**NÃO copie:**
- ❌ O texto markdown formatado (com `-`, `**`, etc.)
- ❌ Os títulos das seções
- ❌ As descrições dos campos

**COPIE APENAS:**
- ✅ A expressão SQL pura: `bucket_id = 'maintenance'`
- ✅ O nome da política conforme indicado

**Exemplo correto:**
1. Clique em "New Policy"
2. No campo "Policy name", digite: `Maintenance images are viewable by anyone`
3. No dropdown "Allowed operation", selecione: `SELECT`
4. No campo "USING expression", cole **EXATAMENTE** isto (sem ponto e vírgula): `bucket_id = 'maintenance'`
5. **DEIXE "Target roles" VAZIO** (não selecione nada)
6. Clique em "Save"

**❌ ERRADO**: `bucket_id = 'maintenance';` (com ponto e vírgula)
**✅ CORRETO**: `bucket_id = 'maintenance'` (sem ponto e vírgula)

### Passo 3: Verificar

Após configurar as políticas:

1. Recarregue a página de Manutenção
2. As imagens anexadas devem aparecer nos cards de chamados
3. Teste fazer upload de uma nova foto em um chamado
4. A foto deve aparecer imediatamente após o upload

## Notas Importantes

- **Política SELECT é OBRIGATÓRIA**: Sem ela, as imagens não aparecerão na página
- **Política INSERT é OBRIGATÓRIA**: Sem ela, não será possível anexar fotos
- Se o bucket for **público** (`Public: true`), as políticas SELECT podem ser mais simples
- Se o bucket for **privado** (`Public: false`), as políticas são essenciais para acesso

## Troubleshooting

### Erro: Imagens não aparecem na página

**Verifique:**
1. ✅ A política de SELECT foi criada?
   - Vá para Storage > Policies
   - Selecione o bucket "maintenance"
   - Verifique se existe uma política com operação "SELECT"

2. ✅ Target roles está vazio na política SELECT?
   - A política de SELECT deve ter "Target roles" **VAZIO**
   - Isso permite acesso público às imagens

3. ✅ USING expression está correto?
   - Deve ser exatamente: `bucket_id = 'maintenance'`
   - Sem ponto e vírgula no final
   - Sem aspas extras

### Erro: Não consigo fazer upload de fotos

**Verifique:**
1. ✅ A política de INSERT foi criada?
2. ✅ Target roles está vazio na política INSERT?
3. ✅ WITH CHECK expression está correto? (`bucket_id = 'maintenance'`)

### Erro: "Bucket not found"

- O bucket "maintenance" não foi criado
- Siga o Passo 1 para criar o bucket

### Verificar se as políticas estão funcionando:

1. Teste visualizar uma imagem anexada em um chamado existente
2. Teste fazer upload de uma nova foto
3. No Supabase Dashboard, vá para Storage > Objects e verifique se os arquivos estão sendo salvos
4. Verifique os logs do console do navegador para mensagens de erro específicas

## Estrutura de Pastas no Bucket

As imagens são salvas na seguinte estrutura:
```
maintenance/
  └── {ticket_id}/
      └── {timestamp}_{random}.{ext}
```

Exemplo:
```
maintenance/
  └── 4d16250f-34fb-45a2-863f-4de0ab31a090/
      └── 1766841110722_o6oqt.jpg
```

## Configuração Recomendada

Para facilitar a visualização das imagens, recomenda-se:

1. **Bucket Público**: Configure o bucket como `Public: true`
   - Isso permite acesso direto às URLs públicas
   - Facilita a visualização sem necessidade de signed URLs

2. **Políticas Mínimas Necessárias**:
   - SELECT: Para visualizar imagens (OBRIGATÓRIA)
   - INSERT: Para anexar fotos (OBRIGATÓRIA)

3. **Políticas Opcionais**:
   - UPDATE: Para atualizar imagens (opcional)
   - DELETE: Para deletar imagens (opcional)


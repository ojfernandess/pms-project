# Instruções para Aplicar Migration de Web Check-in

## 1. Aplicar Migration SQL

Execute a migration `20251115000010_create_web_checkin_tables.sql` no Supabase:

1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Cole o conteúdo do arquivo `supabase/migrations/20251115000010_create_web_checkin_tables.sql`
4. Execute a query

## 2. Criar Bucket de Storage para Documentos

1. No Supabase Dashboard, vá em **Storage**
2. Clique em **New bucket**
3. Nome: `documents`
4. Marque como **Public bucket** (ou configure políticas RLS adequadas)
5. Clique em **Create bucket**

## 3. Configurar Políticas RLS do Storage (Opcional)

Se preferir manter o bucket privado, configure políticas RLS:

```sql
-- Permitir upload de documentos para web check-in
CREATE POLICY "Allow web check-in document uploads"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'web-checkin');

-- Permitir leitura de documentos do web check-in
CREATE POLICY "Allow web check-in document reads"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'web-checkin');
```

## 4. Verificar Funcionamento

Após aplicar as migrations:

1. Crie uma nova reserva no sistema
2. Verifique se um registro foi criado na tabela `web_checkin` com o `reservation_code` da reserva
3. Acesse `/web-checkin/{LOCALIZADOR}` para testar o fluxo

## 5. URLs de Web Check-in

O link de web check-in será gerado automaticamente quando uma reserva for criada:
- Formato: `http://localhost:8080/web-checkin/{LOCALIZADOR}`
- O localizador é o mesmo `reservation_code` da reserva

## Notas

- O web check-in expira 7 dias antes da data de check-in ou na data de check-in (o que for menor)
- Os documentos são opcionais e podem ser enviados posteriormente
- O sistema de envio de emails será implementado em uma próxima etapa


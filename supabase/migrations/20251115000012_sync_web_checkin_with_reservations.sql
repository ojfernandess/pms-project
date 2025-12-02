-- Script para sincronizar web_checkin com reservas existentes
-- Este script cria web_checkin para todas as reservas que não possuem

-- Primeiro, adicionar constraint UNIQUE em reservation_id se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'web_checkin_reservation_id_key' 
        AND conrelid = 'public.web_checkin'::regclass
    ) THEN
        ALTER TABLE public.web_checkin 
        ADD CONSTRAINT web_checkin_reservation_id_key UNIQUE (reservation_id);
    END IF;
END $$;

-- Função para criar web check-in para reservas existentes
DO $$
DECLARE
    reservation_record RECORD;
    token_text TEXT;
    expires_at_date TIMESTAMPTZ;
    existing_web_checkin_id UUID;
BEGIN
    -- Loop através de todas as reservas
    FOR reservation_record IN 
        SELECT 
            r.id,
            r.reservation_code,
            r.checkin_date,
            r.establishment_id
        FROM reservations r
        WHERE r.reservation_code IS NOT NULL
        AND r.reservation_code != ''
        AND r.status NOT IN ('cancelled', 'checkedout')
    LOOP
        -- Verificar se já existe web_checkin para esta reserva
        SELECT id INTO existing_web_checkin_id
        FROM web_checkin 
        WHERE reservation_id = reservation_record.id;
        
        -- Gerar token simples (baseado no ID e código)
        token_text := encode(gen_random_bytes(32), 'base64');
        
        -- Calcular data de expiração
        expires_at_date := reservation_record.checkin_date;
        IF expires_at_date > NOW() + INTERVAL '7 days' THEN
            expires_at_date := NOW() + INTERVAL '7 days';
        END IF;
        
        IF existing_web_checkin_id IS NULL THEN
            -- Inserir web_checkin
            INSERT INTO web_checkin (
                reservation_id,
                establishment_id,
                token,
                locator,
                expires_at,
                status
            ) VALUES (
                reservation_record.id,
                reservation_record.establishment_id,
                token_text,
                reservation_record.reservation_code,
                expires_at_date,
                'pending'
            );
            
            RAISE NOTICE 'Web check-in criado para reserva % com localizador %', 
                reservation_record.id, reservation_record.reservation_code;
        ELSE
            -- Atualizar web_checkin existente se o locator estiver incorreto
            UPDATE web_checkin
            SET 
                locator = reservation_record.reservation_code,
                token = COALESCE(token, token_text),
                expires_at = expires_at_date
            WHERE reservation_id = reservation_record.id
            AND (locator IS NULL OR locator != reservation_record.reservation_code);
            
            IF FOUND THEN
                RAISE NOTICE 'Web check-in atualizado para reserva % com localizador %', 
                    reservation_record.id, reservation_record.reservation_code;
            END IF;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Sincronização concluída';
END $$;

-- Verificar resultado
SELECT 
    COUNT(*) as total_reservations,
    COUNT(wc.id) as total_web_checkins,
    COUNT(*) - COUNT(wc.id) as missing_web_checkins
FROM reservations r
LEFT JOIN web_checkin wc ON wc.reservation_id = r.id
WHERE r.reservation_code IS NOT NULL
AND r.reservation_code != ''
AND r.status NOT IN ('cancelled', 'checkedout');


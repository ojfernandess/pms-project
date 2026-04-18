-- =====================================================
-- TESTE DE AJUSTES PROPORCIONAIS AUTOMÁTICOS
-- =====================================================
-- Este script testa se os fatores de escala estão sendo calculados corretamente

DO $$
DECLARE
  v_room_count INTEGER;
  v_scale_factor DECIMAL(5,2);
  v_test_passed BOOLEAN := true;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TESTE DE AJUSTES PROPORCIONAIS';
  RAISE NOTICE '========================================';
  
  -- Teste 1: 1 quarto = 50%
  v_room_count := 1;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF v_scale_factor != 0.5 THEN
    RAISE NOTICE 'ERRO: 1 quarto deveria ser 0.5 (50%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 1 quarto = 50%% (correto)';
  END IF;
  
  -- Teste 2: 2 quartos = 60%
  v_room_count := 2;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF v_scale_factor != 0.6 THEN
    RAISE NOTICE 'ERRO: 2 quartos deveria ser 0.6 (60%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 2 quartos = 60%% (correto)';
  END IF;
  
  -- Teste 3: 3 quartos = 67.5%
  v_room_count := 3;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF ABS(v_scale_factor - 0.675) > 0.001 THEN
    RAISE NOTICE 'ERRO: 3 quartos deveria ser ~0.675 (67.5%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 3 quartos = 67.5%% (correto)';
  END IF;
  
  -- Teste 4: 4 quartos = 75%
  v_room_count := 4;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF ABS(v_scale_factor - 0.75) > 0.001 THEN
    RAISE NOTICE 'ERRO: 4 quartos deveria ser 0.75 (75%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 4 quartos = 75%% (correto)';
  END IF;
  
  -- Teste 5: 5 quartos = 75%
  v_room_count := 5;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF v_scale_factor != 0.75 THEN
    RAISE NOTICE 'ERRO: 5 quartos deveria ser 0.75 (75%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 5 quartos = 75%% (correto)';
  END IF;
  
  -- Teste 6: 7 quartos = 87.5%
  v_room_count := 7;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF ABS(v_scale_factor - 0.875) > 0.001 THEN
    RAISE NOTICE 'ERRO: 7 quartos deveria ser ~0.875 (87.5%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 7 quartos = 87.5%% (correto)';
  END IF;
  
  -- Teste 7: 9 quartos = 100%
  v_room_count := 9;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF ABS(v_scale_factor - 1.0) > 0.001 THEN
    RAISE NOTICE 'ERRO: 9 quartos deveria ser 1.0 (100%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 9 quartos = 100%% (correto)';
  END IF;
  
  -- Teste 8: 10 quartos = 100%
  v_room_count := 10;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF v_scale_factor != 1.0 THEN
    RAISE NOTICE 'ERRO: 10 quartos deveria ser 1.0 (100%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 10 quartos = 100%% (correto)';
  END IF;
  
  -- Teste 9: 15 quartos = 100%
  v_room_count := 15;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;
  
  IF v_scale_factor != 1.0 THEN
    RAISE NOTICE 'ERRO: 15 quartos deveria ser 1.0 (100%%), mas foi %', v_scale_factor;
    v_test_passed := false;
  ELSE
    RAISE NOTICE '✓ 15 quartos = 100%% (correto)';
  END IF;
  
  RAISE NOTICE '========================================';
  IF v_test_passed THEN
    RAISE NOTICE '✓ TODOS OS TESTES PASSARAM!';
  ELSE
    RAISE NOTICE '✗ ALGUNS TESTES FALHARAM!';
  END IF;
  RAISE NOTICE '========================================';
END $$;


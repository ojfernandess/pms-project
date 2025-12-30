import { supabase } from "@/integrations/supabase/client";

/**
 * Verifica se uma empresa tem acesso a uma funcionalidade específica
 * @param featureKey - Chave da funcionalidade (ex: 'dynamic_pricing_automation')
 * @param companyId - ID da empresa
 * @returns true se a empresa tem acesso, false caso contrário
 */
export const checkCompanyFeatureAccess = async (
  featureKey: string,
  companyId: string
): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('company_has_feature_access', {
      p_feature_key: featureKey,
      p_company_id: companyId,
    });

    if (error) {
      console.error('Erro ao verificar acesso à funcionalidade:', error);
      return false;
    }

    return data ?? false;
  } catch (error) {
    console.error('Erro ao verificar acesso à funcionalidade:', error);
    return false;
  }
};

/**
 * Verifica se o estabelecimento atual tem acesso a uma funcionalidade
 * @param featureKey - Chave da funcionalidade
 * @param establishmentId - ID do estabelecimento
 * @returns true se a empresa do estabelecimento tem acesso, false caso contrário
 */
export const checkEstablishmentFeatureAccess = async (
  featureKey: string,
  establishmentId: string
): Promise<boolean> => {
  try {
    // Buscar company_id do estabelecimento
    const { data: establishment, error: estError } = await supabase
      .from('establishments')
      .select('company_id')
      .eq('id', establishmentId)
      .single();

    if (estError || !establishment?.company_id) {
      console.error('Erro ao buscar estabelecimento:', estError);
      return false;
    }

    return checkCompanyFeatureAccess(featureKey, establishment.company_id);
  } catch (error) {
    console.error('Erro ao verificar acesso do estabelecimento:', error);
    return false;
  }
};

/**
 * Verifica se uma funcionalidade está habilitada para um estabelecimento específico
 * @param featureConfig - Configuração da funcionalidade (pode ser boolean ou objeto com enabled e establishment_ids)
 * @param establishmentId - ID do estabelecimento
 * @returns true se a funcionalidade está habilitada para o estabelecimento, false caso contrário
 */
export const isFeatureEnabledForEstablishment = (
  featureConfig: any,
  establishmentId: string | null | undefined
): boolean => {
  if (!establishmentId) {
    return false;
  }

  // Se for boolean (formato antigo), retornar o valor diretamente
  if (typeof featureConfig === 'boolean') {
    return featureConfig;
  }

  // Se for objeto, verificar enabled e establishment_ids
  if (typeof featureConfig === 'object' && featureConfig !== null) {
    // Verificar se está habilitado globalmente
    if (featureConfig.enabled !== true) {
      return false;
    }

    // Se não há establishment_ids, significa que está habilitado para todos
    if (!featureConfig.establishment_ids || !Array.isArray(featureConfig.establishment_ids)) {
      return true;
    }

    // Verificar se o estabelecimento está na lista
    return featureConfig.establishment_ids.includes(establishmentId);
  }

  return false;
};

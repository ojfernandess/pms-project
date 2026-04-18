import { supabase } from "@/integrations/supabase/client";

/**
 * Obtém o establishment_id do estabelecimento selecionado
 * Tenta primeiro do contexto, depois do localStorage
 */
export const getSelectedEstablishmentId = (): string | null => {
  // Tentar obter do localStorage
  const storedId = localStorage.getItem("selectedEstablishmentId");
  if (storedId) {
    return storedId;
  }
  
  // Se não houver no localStorage, retornar null
  // O contexto deve ser usado diretamente quando possível
  return null;
};

/**
 * Verifica se o usuário tem acesso ao estabelecimento
 */
export const hasAccessToEstablishment = async (establishmentId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Buscar empresas do usuário
    const { data: userCompanies } = await supabase
      .from("user_companies")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (!userCompanies || userCompanies.length === 0) return false;

    const companyIds = userCompanies.map((uc: any) => uc.company_id);

    // Verificar se o estabelecimento pertence a uma das empresas do usuário
    const { data: establishment } = await supabase
      .from("establishments")
      .select("company_id")
      .eq("id", establishmentId)
      .single();

    if (!establishment) return false;

    return companyIds.includes(establishment.company_id);
  } catch (error) {
    console.error("Erro ao verificar acesso ao estabelecimento:", error);
    return false;
  }
};



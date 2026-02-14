import { supabase } from "@/integrations/supabase/client";

/**
 * Busca planos tarifários disponíveis no motor de reservas para uma categoria específica
 */
export const getAvailablePricingPlansForCategory = async (
  establishmentId: string,
  categoryId: string
): Promise<any[]> => {
  try {
    // Buscar planos que:
    // 1. Estão disponíveis no motor de reservas
    // 2. Estão ativos
    // 3. Têm a categoria associada OU não têm restrição de categoria
    const { data: plans, error } = await supabase
      .from("pricing_plans")
      .select(`
        *,
        cancellation_policies:cancellation_policy_id(*),
        pricing_plan_categories!inner(category_id)
      `)
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .eq("available_in_booking_engine", true)
      .eq("pricing_plan_categories.category_id", categoryId);

    if (error) {
      console.error("Erro ao buscar planos tarifários:", error);
      return [];
    }

    return plans || [];
  } catch (error) {
    console.error("Erro ao buscar planos tarifários:", error);
    return [];
  }
};

/**
 * Busca todos os planos tarifários disponíveis no motor de reservas para um estabelecimento
 */
export const getAllAvailablePricingPlans = async (
  establishmentId: string
): Promise<any[]> => {
  try {
    const { data: plans, error } = await supabase
      .from("pricing_plans")
      .select(`
        *,
        cancellation_policies:cancellation_policy_id(*),
        pricing_plan_categories(category_id, room_categories:category_id(id, name))
      `)
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .eq("available_in_booking_engine", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Erro ao buscar planos tarifários:", error);
      return [];
    }

    return plans || [];
  } catch (error) {
    console.error("Erro ao buscar planos tarifários:", error);
    return [];
  }
};

/**
 * Verifica se um plano tarifário está disponível para uma categoria específica
 */
export const isPlanAvailableForCategory = (
  plan: any,
  categoryId: string
): boolean => {
  if (!plan.pricing_plan_categories || plan.pricing_plan_categories.length === 0) {
    // Se não tem categorias associadas, está disponível para todas
    return true;
  }

  return plan.pricing_plan_categories.some(
    (ppc: any) => ppc.category_id === categoryId
  );
};

/**
 * Gera resumo curto dinâmico da política de cancelamento
 * Formato: "Cancelamento grátis até {deadline}. Após isso será cobrado {penalty}. No-show: {no_show_penalty}."
 */
export const formatCancellationPolicyShortSummary = (policy: any): string => {
  if (!policy) return "";

  const parts: string[] = [];

  // Prazo de cancelamento gratuito
  if (policy.has_free_cancellation && policy.free_cancellation_deadline) {
    parts.push(`Cancelamento grátis até ${policy.free_cancellation_deadline}`);
  } else {
    parts.push("Cancelamento não gratuito");
  }

  // Multa após prazo gratuito ou multa direta
  let penaltyText = "";
  if (policy.has_free_cancellation && policy.cancellation_fee_after_deadline_type) {
    if (policy.cancellation_fee_after_deadline_type === "first_night") {
      penaltyText = "primeira diária";
    } else if (policy.cancellation_fee_after_deadline_type === "percentage" && policy.cancellation_fee_after_deadline_percentage) {
      penaltyText = `${policy.cancellation_fee_after_deadline_percentage}% do total`;
    }
  } else if (!policy.has_free_cancellation) {
    if (policy.cancellation_fee_type === "first_night") {
      penaltyText = "primeira diária";
    } else if (policy.cancellation_fee_type === "percentage" && policy.cancellation_fee_percentage) {
      penaltyText = `${policy.cancellation_fee_percentage}% do total`;
    }
  }

  if (penaltyText) {
    parts.push(`Após isso será cobrado ${penaltyText}`);
  }

  // No-show
  let noShowText = "";
  if (policy.no_show_fee_type === "same_as_cancellation") {
    noShowText = penaltyText || "preço total";
  } else if (policy.no_show_fee_type === "first_night") {
    noShowText = "primeira diária";
  } else if (policy.no_show_fee_type === "percentage" && policy.no_show_fee_percentage) {
    noShowText = `${policy.no_show_fee_percentage}% do total`;
  }

  if (noShowText) {
    parts.push(`No-show: ${noShowText}`);
  }

  return parts.join(". ") + ".";
};

/**
 * Formata a descrição completa da política de cancelamento para exibição
 */
export const formatCancellationPolicyDescription = (policy: any): string => {
  if (!policy) return "";

  // Usar o resumo gerado automaticamente se disponível
  if (policy.policy_summary) {
    return policy.policy_summary;
  }

  let description = "";

  if (policy.has_free_cancellation && policy.free_cancellation_deadline) {
    description += `O hóspede pode cancelar gratuitamente ${policy.free_cancellation_deadline}. `;
  }

  if (policy.cancellation_fee_type === "first_night") {
    description += "O hóspede deverá pagar o custo da primeira diária em caso de cancelamento";
    if (policy.has_free_cancellation) {
      description += " após o prazo de cancelamento gratuito";
    }
    description += ".";
  } else if (policy.cancellation_fee_type === "percentage" && policy.cancellation_fee_percentage) {
    description += `O hóspede deverá pagar ${policy.cancellation_fee_percentage}% do preço total em caso de cancelamento`;
    if (policy.has_free_cancellation) {
      description += " após o prazo de cancelamento gratuito";
    }
    description += ".";
  }

  if (policy.no_show_fee_type === "same_as_cancellation") {
    description += " Em caso de não comparecimento, o hóspede será cobrado do preço total da reserva.";
  } else if (policy.no_show_fee_type === "first_night") {
    description += " Em caso de não comparecimento, o hóspede será cobrado o custo da primeira diária.";
  } else if (policy.no_show_fee_type === "percentage" && policy.no_show_fee_percentage) {
    description += ` Em caso de não comparecimento, o hóspede será cobrado ${policy.no_show_fee_percentage}% do preço total.`;
  }

  if (policy.requires_prepayment && policy.prepayment_percentage) {
    description += ` O hóspede será cobrado um pré-pagamento de ${policy.prepayment_percentage}% do preço total após a reserva.`;
  }

  return description || policy.description || "";
};


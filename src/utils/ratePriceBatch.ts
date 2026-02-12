/**
 * Utilitário para fazer requisições de cálculo de preço em batch
 * com limite de concorrência e cancelamento de requisições anteriores
 */

interface PriceRequest {
  establishmentId: string;
  categoryId: string;
  planId: string;
  date: string;
  adults: number;
  children: number;
}

interface PriceResult {
  success: boolean;
  price: number;
  basePrice: number;
  error?: string;
}

/**
 * Faz requisições em batch com limite de concorrência
 * @param requests Array de requisições
 * @param supabase Cliente Supabase
 * @param maxConcurrent Número máximo de requisições simultâneas (padrão: 3)
 * @param abortSignal Signal para cancelar requisições
 * @returns Array de resultados na mesma ordem das requisições
 */
export async function batchCalculateRatePrice(
  requests: PriceRequest[],
  supabase: any,
  maxConcurrent: number = 3,
  abortSignal?: AbortSignal
): Promise<PriceResult[]> {
  if (requests.length === 0) return [];

  const results: PriceResult[] = new Array(requests.length);
  const basePrices: Record<string, number> = {};

  // Buscar preços base das categorias em uma única query
  const categoryIds = [...new Set(requests.map(r => r.categoryId))];
  try {
    const { data: categories } = await supabase
      .from("room_categories")
      .select("id, base_price")
      .in("id", categoryIds);

    if (categories) {
      categories.forEach((cat: any) => {
        basePrices[cat.id] = Number(cat.base_price || 0);
      });
    }
  } catch (error) {
    console.warn("Erro ao buscar preços base:", error);
  }

  // Processar requisições em lotes
  for (let i = 0; i < requests.length; i += maxConcurrent) {
    if (abortSignal?.aborted) {
      // Preencher resultados restantes com preço base
      for (let j = i; j < requests.length; j++) {
        const req = requests[j];
        results[j] = {
          success: false,
          price: basePrices[req.categoryId] || 0,
          basePrice: basePrices[req.categoryId] || 0,
          error: "Request cancelled",
        };
      }
      break;
    }

    const batch = requests.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async (req, batchIndex) => {
      const globalIndex = i + batchIndex;
      const basePrice = basePrices[req.categoryId] || 0;

      try {
        const { data, error } = await supabase.rpc("calculate_rate_price", {
          p_establishment_id: req.establishmentId,
          p_category_id: req.categoryId,
          p_pricing_plan_id: req.planId,
          p_date: req.date,
          p_adults: req.adults,
          p_children: req.children,
        });

        if (abortSignal?.aborted) {
          return {
            success: false,
            price: basePrice,
            basePrice,
            error: "Request cancelled",
          };
        }

        if (error) {
          return {
            success: false,
            price: basePrice,
            basePrice,
            error: error.message || "Unknown error",
          };
        }

        const price = Number(data || 0);
        return {
          success: true,
          price: price > 0 ? price : basePrice,
          basePrice,
        };
      } catch (fetchError: any) {
        if (abortSignal?.aborted) {
          return {
            success: false,
            price: basePrice,
            basePrice,
            error: "Request cancelled",
          };
        }

        // Para erros de rede, usar preço base sem tentar fallback
        return {
          success: false,
          price: basePrice,
          basePrice,
          error: fetchError.message || "Network error",
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((result, batchIndex) => {
      results[i + batchIndex] = result;
    });

    // Pequeno delay entre lotes para evitar sobrecarga
    if (i + maxConcurrent < requests.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return results;
}


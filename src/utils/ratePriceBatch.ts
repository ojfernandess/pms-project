/**
 * Utilitário para fazer requisições de cálculo de preço em batch
 * com limite de concorrência e cancelamento de requisições anteriores.
 *
 * O preço retornado segue a liga de preços por quantidade de hóspedes (x1, x2, x3, x4):
 * - adults=1 → Preço x1 | adults=2 → Preço padrão x2 | adults=3 → Preço x3 | adults≥4 → Preço x4
 * Usado pelo motor de reservas e pela página pública de reserva.
 *
 * RPC `calculate_rate_price` passa por `calculateRatePriceWithResilience` (cache, semáforo,
 * circuit breaker, janela deslizante) para evitar net::ERR_INSUFFICIENT_RESOURCES.
 */

import { calculateRatePriceWithResilience } from "@/lib/calculateRatePriceRpc";

interface PriceRequest {
  establishmentId: string;
  categoryId: string;
  planId: string;
  date: string;
  /** Número de adultos (define qual preço da liga x1/x2/x3/x4 será usado) */
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
 * Faz requisições em batch com limite de concorrência e retry para erros de rede
 * @param requests Array de requisições
 * @param supabase Cliente Supabase
 * @param maxConcurrent Número máximo de requisições simultâneas (padrão: 2, evita ERR_FAILED)
 * @param abortSignal Signal para cancelar requisições
 * @returns Array de resultados na mesma ordem das requisições
 */
export async function batchCalculateRatePrice(
  requests: PriceRequest[],
  supabase: any,
  /** 1 = menos pressão no PostgREST (recomendado com muitas noites/planos) */
  maxConcurrent: number = 1,
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
      const basePrice = basePrices[req.categoryId] || 0;

      const doRpc = async (): Promise<PriceResult> => {
        const rpcParams = {
          p_establishment_id: req.establishmentId,
          p_category_id: req.categoryId,
          p_pricing_plan_id: req.planId,
          p_date: req.date,
          p_adults: req.adults,
          p_children: req.children,
        };

        if (abortSignal?.aborted) {
          return { success: false, price: basePrice, basePrice, error: "Request cancelled" };
        }

        const result = await calculateRatePriceWithResilience(supabase, rpcParams, {
          basePrice,
          signal: abortSignal,
        });

        if (abortSignal?.aborted) {
          return { success: false, price: basePrice, basePrice, error: "Request cancelled" };
        }

        if (result.error) {
          return {
            success: false,
            price: basePrice,
            basePrice,
            error: result.error.message || "Unknown error",
          };
        }

        const price = Number(result.data || 0);
        return {
          success: true,
          price: price > 0 ? price : basePrice,
          basePrice,
        };
      };

      try {
        return await doRpc();
      } catch (fetchError: unknown) {
        if (abortSignal?.aborted) {
          return { success: false, price: basePrice, basePrice, error: "Request cancelled" };
        }
        return {
          success: false,
          price: basePrice,
          basePrice,
          error: (fetchError as Error).message || "Network error",
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((result, batchIndex) => {
      results[i + batchIndex] = result;
    });

    // Delay entre lotes para evitar 502/ERR_FAILED na API (muitas RPCs seguidas)
    if (i + maxConcurrent < requests.length) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  return results;
}


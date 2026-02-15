/**
 * Cache compartilhado de preços dinâmicos entre Mapa Tarifário e Grade ARI.
 * Persiste na troca de abas e evita recálculo desnecessário.
 */

import { createContext, useContext, useState, useCallback, useMemo } from "react";

type DynamicPricesMap = Record<string, number>;

interface DynamicRatePricesContextValue {
  getPrice: (key: string) => number | undefined;
  getPricesSnapshot: () => Record<string, number>;
  setPrices: (prices: Record<string, number>) => void;
  setPrice: (key: string, price: number) => void;
  clearPrices: () => void;
}

const DynamicRatePricesContext = createContext<DynamicRatePricesContextValue | null>(null);

export function DynamicRatePricesProvider({ children }: { children: React.ReactNode }) {
  const [prices, setPricesState] = useState<DynamicPricesMap>({});

  const setPrices = useCallback((newPrices: Record<string, number>) => {
    setPricesState((prev) => ({ ...prev, ...newPrices }));
  }, []);

  const setPrice = useCallback((key: string, price: number) => {
    setPricesState((prev) => ({ ...prev, [key]: price }));
  }, []);

  const getPrice = useCallback(
    (key: string) => {
      const val = prices[key];
      return val !== undefined && val > 0 ? val : undefined;
    },
    [prices]
  );

  const clearPrices = useCallback(() => {
    setPricesState({});
  }, []);

  const getPricesSnapshot = useCallback(() => ({ ...prices }), [prices]);

  const value = useMemo(
    () => ({ getPrice, getPricesSnapshot, setPrices, setPrice, clearPrices }),
    [getPrice, getPricesSnapshot, setPrices, setPrice, clearPrices]
  );

  return (
    <DynamicRatePricesContext.Provider value={value}>
      {children}
    </DynamicRatePricesContext.Provider>
  );
}

export function useDynamicRatePrices() {
  const ctx = useContext(DynamicRatePricesContext);
  return ctx;
}

import { createContext, useContext, type ReactNode } from "react";
import type { Market } from "../api/types";

interface MarketContextValue {
  market: Market;
}

const MarketContext = createContext<MarketContextValue>({ market: "IN" });

export function MarketProvider({ children }: { children: ReactNode }) {
  return <MarketContext.Provider value={{ market: "IN" }}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketContextValue {
  return useContext(MarketContext);
}

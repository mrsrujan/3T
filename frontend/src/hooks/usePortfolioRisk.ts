import { useQuery } from "@tanstack/react-query";
import { getPortfolioRisk } from "../api/client";

export function usePortfolioRisk() {
  return useQuery({
    queryKey: ["portfolio-risk"],
    queryFn: getPortfolioRisk,
    staleTime: 5 * 60 * 1000,
  });
}

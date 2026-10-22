import { useQuery } from "@tanstack/react-query";
import { getFiiDii } from "../api/client";

export function useFiiDii(days = 20) {
  return useQuery({
    queryKey: ["fii-dii", days],
    queryFn: () => getFiiDii(days),
    staleTime: 30 * 60 * 1000,
  });
}

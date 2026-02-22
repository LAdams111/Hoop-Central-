import { useQuery } from "@tanstack/react-query";
import { normalizeScraperPlayerList, type RailwayPlayerDisplay } from "@/lib/railwayPlayer";

/**
 * Fetches the full list of players from the Railway scraper and normalizes them
 * to the same shape the app uses for the directory/cards.
 */
export function useRailwayPlayers() {
  return useQuery({
    queryKey: ["/api/railway/players"],
    queryFn: async (): Promise<RailwayPlayerDisplay[]> => {
      const res = await fetch("/api/railway/players");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || "Failed to fetch Railway players");
      }
      const raw = await res.json();
      return normalizeScraperPlayerList(raw);
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { normalizeScraperPlayerList, type RailwayPlayerDisplay } from "@/lib/railwayPlayer";

/** Player list item: either from Railway (bbrefId) or from local DB (numeric id only). */
export type PlayerListItem = RailwayPlayerDisplay | (RailwayPlayerDisplay & { bbrefId?: undefined; id: number });

/**
 * Fetches the full list of players: tries Railway scraper first, falls back to
 * local database if the scraper is down or doesn't expose GET /api/players.
 */
export function useRailwayPlayers() {
  return useQuery({
    queryKey: ["/api/railway/players"],
    queryFn: async (): Promise<PlayerListItem[]> => {
      try {
        const res = await fetch("/api/railway/players");
        if (res.ok) {
          const raw = await res.json();
          const list = Array.isArray(raw) ? raw : (raw?.players ?? raw?.data ?? []);
          if (Array.isArray(list) && list.length > 0) {
            return normalizeScraperPlayerList(list);
          }
        }
      } catch {
        // Scraper unreachable or invalid response — fall through to DB
      }
      const fallback = await fetch("/api/players");
      if (!fallback.ok) throw new Error("Failed to load players");
      const dbPlayers = await fallback.json();
      return Array.isArray(dbPlayers) ? dbPlayers : [];
    },
  });
}

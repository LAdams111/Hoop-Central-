import { useQuery } from "@tanstack/react-query";

/**
 * Fetches a single player from the Railway-deployed scraper API by Basketball-Reference ID
 * (e.g. "jamesle01"). Data is proxied via our server to avoid CORS.
 */
export function useRailwayPlayer(bbrefId: string | null) {
  return useQuery({
    queryKey: ["/api/railway/player", bbrefId],
    queryFn: async () => {
      if (!bbrefId?.trim()) return null;
      const res = await fetch(`/api/railway/player/${encodeURIComponent(bbrefId.trim())}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || "Failed to fetch from Railway scraper");
      }
      return res.json() as Promise<unknown>;
    },
    enabled: !!bbrefId?.trim(),
  });
}

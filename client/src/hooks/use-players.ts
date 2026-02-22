import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

// ============================================
// READ HOOKS
// ============================================

export function usePlayers(filters?: { search?: string; position?: string; sortBy?: "views" | "name" }) {
  return useQuery({
    queryKey: [api.players.list.path, filters],
    queryFn: async () => {
      // Build query params properly
      const params = new URLSearchParams();
      if (filters?.search) params.append("search", filters.search);
      if (filters?.position && filters.position !== "ALL") params.append("position", filters.position);
      if (filters?.sortBy) params.append("sortBy", filters.sortBy);
      
      const url = `${api.players.list.path}?${params.toString()}`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error("Failed to fetch players");
      return api.players.list.responses[200].parse(await res.json());
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function usePlayer(id: number | string) {
  const idStr = id == null ? "" : String(id);
  const enabled = idStr !== "" && idStr !== "0";
  return useQuery({
    queryKey: [api.players.get.path, idStr],
    queryFn: async () => {
      const url = idStr ? `${api.players.get.path.replace(":id", encodeURIComponent(idStr))}` : "";
      const res = await fetch(url);
      
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch player");
      
      return api.players.get.responses[200].parse(await res.json());
    },
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

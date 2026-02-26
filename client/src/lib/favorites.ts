/**
 * Device-local player favorites (localStorage).
 * Stored per browser/device; not sent to server. Persists across sessions.
 */
const PLAYER_FAVORITES_KEY = "player_favorites";

export interface FavoritePlayer {
  id: string;
  name?: string;
  headshotUrl?: string;
  team?: string;
}

function parseFavorites(raw: string | null): FavoritePlayer[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: unknown) => {
      if (item && typeof item === "object" && "id" in item && typeof (item as FavoritePlayer).id === "string")
        return true;
      if (typeof item === "string" || typeof item === "number") return true;
      return false;
    }).map((item: unknown): FavoritePlayer => {
      if (item && typeof item === "object" && "id" in item)
        return { id: String((item as FavoritePlayer).id), name: (item as FavoritePlayer).name, headshotUrl: (item as FavoritePlayer).headshotUrl, team: (item as FavoritePlayer).team };
      return { id: String(item) };
    });
  } catch {
    return [];
  }
}

export function getPlayerFavorites(): FavoritePlayer[] {
  return parseFavorites(typeof localStorage !== "undefined" ? localStorage.getItem(PLAYER_FAVORITES_KEY) : null);
}

export function isPlayerFavorited(id: string | number): boolean {
  const idStr = String(id);
  return getPlayerFavorites().some((f) => f.id === idStr);
}

export function setPlayerFavorites(list: FavoritePlayer[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PLAYER_FAVORITES_KEY, JSON.stringify(list));
}

export function addPlayerFavorite(player: FavoritePlayer): void {
  const list = getPlayerFavorites().filter((f) => f.id !== player.id);
  list.push(player);
  setPlayerFavorites(list);
}

export function removePlayerFavorite(id: string | number): void {
  const idStr = String(id);
  setPlayerFavorites(getPlayerFavorites().filter((f) => f.id !== idStr));
}

export function togglePlayerFavorite(id: string | number, player?: { name?: string; headshotUrl?: string; team?: string }): boolean {
  const idStr = String(id);
  const list = getPlayerFavorites();
  const existing = list.find((f) => f.id === idStr);
  if (existing) {
    removePlayerFavorite(idStr);
    return false;
  }
  addPlayerFavorite({ id: idStr, name: player?.name, headshotUrl: player?.headshotUrl, team: player?.team });
  return true;
}

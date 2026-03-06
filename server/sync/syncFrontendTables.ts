/**
 * Legacy sync: canonical → player_info / player_stats.
 * Those tables have been removed; this is a no-op and returns zeros.
 */

export interface SyncResult {
  playersUpserted: number;
  statsDeleted: number;
  statsInserted: number;
  errors: string[];
}

/**
 * No-op: player_info and player_stats no longer exist.
 * Canonical tables (players, player_seasons, player_season_stats) are the source of truth.
 */
export async function syncFrontendTables(): Promise<SyncResult> {
  return {
    playersUpserted: 0,
    statsDeleted: 0,
    statsInserted: 0,
    errors: [],
  };
}

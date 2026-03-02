import { players, playerStats, awards, teamRecords, siteSettings, type Player, type InsertPlayer, type PlayerStats, type InsertPlayerStats, type Award, type InsertAward, type TeamRecord, type InsertTeamRecord } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, sql, and, inArray } from "drizzle-orm";

/** Abbreviation → full name so roster can match either. */
const TEAM_ABBREV_TO_FULL: Record<string, string> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets", BRK: "Brooklyn Nets",
  CHA: "Charlotte Hornets", CHO: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "LA Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns", PHO: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
  NJN: "Brooklyn Nets", NOH: "New Orleans Pelicans", SEA: "Oklahoma City Thunder",
  VAN: "Memphis Grizzlies", CHH: "Charlotte Hornets", WSB: "Washington Wizards",
};
/** Exported so roster API can use for external-table fallback. */
export function getTeamMatchCandidates(team: string): string[] {
  const t = (team ?? "").replace(/\+/g, " ").trim();
  const full = TEAM_ABBREV_TO_FULL[t] ?? (t.length <= 4 ? undefined : t);
  const abbrev = Object.entries(TEAM_ABBREV_TO_FULL).find(([, v]) => v.toLowerCase() === t.toLowerCase())?.[0] ?? (t.length <= 4 ? t : undefined);
  const set = new Set<string>();
  if (t) set.add(t.toLowerCase());
  if (full) set.add(full.toLowerCase());
  if (abbrev) set.add(abbrev.toLowerCase());
  return Array.from(set);
}

export interface IStorage {
  // Players
  getPlayers(search?: string, position?: string, sortBy?: "views" | "name"): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  getPlayerCount(): Promise<number>;
  incrementPlayerViews(id: number): Promise<void>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  // Birth Year
  getPlayersByBirthYear(year: number): Promise<Player[]>;
  
  // Prospects (under age threshold, sorted by views)
  getProspects(maxAge: number, limit: number): Promise<Player[]>;
  
  // Awards
  getPlayerAwards(playerId: number): Promise<Award[]>;
  createAward(award: InsertAward): Promise<Award>;

  // Team Records
  getTeamRecord(team: string, season: string): Promise<TeamRecord | undefined>;
  createTeamRecord(record: InsertTeamRecord): Promise<TeamRecord>;

  // Player Updates
  updatePlayerHeadshot(id: number, headshotUrl: string): Promise<void>;
  updatePlayer(id: number, data: Partial<Pick<Player, 'name' | 'position' | 'team' | 'height' | 'weight' | 'jerseyNumber' | 'bio' | 'hometown' | 'birthDate'>>): Promise<Player | undefined>;
  /** Admin: set a player's profile view count. */
  setPlayerProfileViews(id: number, profileViews: number): Promise<void>;

  getPlayerByNameAndTeam(name: string, team: string): Promise<Player | undefined>;
  deletePlayerStats(playerId: number): Promise<void>;

  /** True if player has at least one row in player_stats with league = 'NBA'. */
  getPlayerHasNbaStats(playerId: number): Promise<boolean>;
  /** Add a one-time random boost (10,000–16,000) to profile_views for players who have played in the NBA. */
  addNbaProfileViewsBoost(playerId: number): Promise<void>;
  /** One-time backfill: add NBA views boost to all players with NBA stats and profile_views < 10000. Returns count updated. */
  backfillNbaProfileViews(): Promise<number>;

  // League Teams
  getTeamsByLeague(league: string): Promise<{ team: string; season: string }[]>;
  getAllTeamsWithLeague(): Promise<{ team: string; league: string; season: string }[]>;
  getTotalTeamCount(): Promise<number>;

  // Site Settings (Featured Players) — store full snapshot so no lookup needed
  getFeaturedPlayerIds(): Promise<number[]>;
  setFeaturedPlayerIds(ids: number[]): Promise<void>;
  getFeaturedPlayers(): Promise<Player[]>;
  /** Overwrite featured list with full player objects (max 5). Used by admin save. */
  setFeaturedPlayersSnapshot(players: Player[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getPlayers(search?: string, position?: string, sortBy?: "views" | "name"): Promise<Player[]> {
    let query = db.select().from(players);
    
    if (search) {
      query = query.where(ilike(players.name, `%${search}%`)) as any;
    }
    
    if (position) {
      query = query.where(eq(players.position, position)) as any;
    }

    if (sortBy === "views") {
      query = query.orderBy(sql`${players.profileViews} DESC`) as any;
    } else {
      query = query.orderBy(players.name) as any;
    }
    
    return await query;
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player;
  }

  async getPlayerCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(players);
    return row?.count ?? 0;
  }

  async incrementPlayerViews(id: number): Promise<void> {
    await db.update(players)
      .set({ profileViews: sql`${players.profileViews} + 1` })
      .where(eq(players.id, id));
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db.insert(players).values(insertPlayer).returning();
    return player;
  }

  async getPlayerStats(playerId: number): Promise<PlayerStats[]> {
    return await db.select().from(playerStats).where(eq(playerStats.playerId, playerId));
  }

  /** Roster = JOIN player_info + player_stats; filter by stats.team and stats.season only (no current_team). */
  async getRoster(team: string, season: string): Promise<Player[]> {
    const teamTrimmed = (team ?? "").replace(/\+/g, " ").trim();
    const teamCandidates = getTeamMatchCandidates(teamTrimmed);
    if (teamCandidates.length === 0) return [];
    const teamConditionStats = or(...teamCandidates.map((c) => sql`LOWER(${playerStats.team}) = ${c}`));
    const seasonNorm = (season ?? "").trim();
    const seasonCandidates: string[] = seasonNorm ? [seasonNorm] : [];
    // Integer year from frontend = starting year (e.g. 2025 → match "2025-26" and "2025")
    if (/^\d{4}$/.test(seasonNorm)) {
      const y = parseInt(seasonNorm, 10);
      seasonCandidates.push(`${y}-${String(y + 1).slice(-2)}`);
    }
    // "2025-26" from URL/legacy: also match start year "2025"
    const rangeMatch = seasonNorm.match(/^(\d{4})-(\d{2})$/);
    if (rangeMatch) {
      const startYear = rangeMatch[1];
      if (!seasonCandidates.includes(startYear)) seasonCandidates.push(startYear);
    }
    console.log("[roster getRoster] season filter candidates:", JSON.stringify(seasonCandidates));
    // Explicit CAST so comparison works when DB stores season as integer (avoids "integer = text" error)
    const seasonCondition = sql`CAST(${playerStats.season} AS text) IN (${sql.join(seasonCandidates.map((c) => sql`${c}`), sql`, `)})`;
    const results = await db
      .select({ player: players })
      .from(players)
      .innerJoin(playerStats, eq(players.id, playerStats.playerId))
      .where(and(teamConditionStats, seasonCondition));
    console.log("[roster getRoster] query returned rows:", results.length);
    const seen = new Set<number>();
    return results.map((r) => r.player).filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }

  async createPlayerStats(insertStats: InsertPlayerStats): Promise<PlayerStats> {
    const [stats] = await db.insert(playerStats).values(insertStats).returning();
    return stats;
  }

  async getProspects(maxAge: number, limit: number): Promise<Player[]> {
    return await db
      .select()
      .from(players)
      .where(sql`${players.birthDate} IS NOT NULL AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, ${players.birthDate}::date)) < ${maxAge}`)
      .orderBy(sql`${players.profileViews} DESC`)
      .limit(limit);
  }

  async getPlayersByBirthYear(year: number): Promise<Player[]> {
    return await db
      .select()
      .from(players)
      .where(sql`EXTRACT(YEAR FROM ${players.birthDate}::date) = ${year}`)
      .orderBy(sql`${players.profileViews} DESC`)
      .limit(100);
  }

  async getPlayerAwards(playerId: number): Promise<Award[]> {
    return await db.select().from(awards).where(eq(awards.playerId, playerId));
  }

  async createAward(insertAward: InsertAward): Promise<Award> {
    const [award] = await db.insert(awards).values(insertAward).returning();
    return award;
  }

  async updatePlayerHeadshot(id: number, headshotUrl: string): Promise<void> {
    await db.update(players).set({ headshotUrl }).where(eq(players.id, id));
  }

  async updatePlayer(id: number, data: Partial<Pick<Player, 'name' | 'position' | 'team' | 'height' | 'weight' | 'jerseyNumber' | 'bio' | 'hometown' | 'birthDate'>>): Promise<Player | undefined> {
    const [updated] = await db.update(players).set(data).where(eq(players.id, id)).returning();
    return updated;
  }

  async setPlayerProfileViews(id: number, profileViews: number): Promise<void> {
    const value = Math.max(0, Math.floor(Number(profileViews)));
    await db.update(players).set({ profileViews: value }).where(eq(players.id, id));
  }

  async getPlayerByNameAndTeam(name: string, team: string): Promise<Player | undefined> {
    const [p] = await db
      .select()
      .from(players)
      .where(and(ilike(players.name, name), ilike(players.team, team)))
      .limit(1);
    return p;
  }

  async deletePlayerStats(playerId: number): Promise<void> {
    await db.delete(playerStats).where(eq(playerStats.playerId, playerId));
  }

  async getPlayerHasNbaStats(playerId: number): Promise<boolean> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(playerStats)
      .where(and(eq(playerStats.playerId, playerId), sql`LOWER(${playerStats.league}) = 'nba'`));
    return (row?.count ?? 0) > 0;
  }

  async addNbaProfileViewsBoost(playerId: number): Promise<void> {
    const boost = Math.floor(Math.random() * 6001) + 10000;
    await db.update(players)
      .set({ profileViews: sql`${players.profileViews} + ${boost}` })
      .where(eq(players.id, playerId));
  }

  async backfillNbaProfileViews(): Promise<number> {
    const rows = await db
      .selectDistinct({ id: players.id })
      .from(players)
      .innerJoin(playerStats, eq(players.id, playerStats.playerId))
      .where(
        and(
          sql`LOWER(${playerStats.league}) = 'nba'`,
          sql`${players.profileViews} < 10000`
        )
      );
    let updated = 0;
    for (const { id } of rows) {
      await this.addNbaProfileViewsBoost(id);
      updated++;
    }
    return updated;
  }

  async getTeamRecord(team: string, season: string): Promise<TeamRecord | undefined> {
    const teamLower = team.toLowerCase();
    const [record] = await db
      .select()
      .from(teamRecords)
      .where(sql`LOWER(${teamRecords.team}) = ${teamLower} AND ${teamRecords.season} = ${season}`);
    return record;
  }

  async createTeamRecord(record: InsertTeamRecord): Promise<TeamRecord> {
    const [created] = await db.insert(teamRecords).values(record).returning();
    return created;
  }

  async getAllTeamsWithLeague(): Promise<{ team: string; league: string; season: string }[]> {
    const results = await db
      .select({ team: playerStats.team, league: playerStats.league, season: playerStats.season })
      .from(playerStats)
      .groupBy(playerStats.team, playerStats.league, playerStats.season)
      .orderBy(playerStats.team);
    return results;
  }

  async getTeamsByLeague(league: string): Promise<{ team: string; season: string }[]> {
    const results = await db
      .select({ team: playerStats.team, season: playerStats.season })
      .from(playerStats)
      .where(eq(playerStats.league, league))
      .groupBy(playerStats.team, playerStats.season)
      .orderBy(playerStats.team);
    return results;
  }

  async getTotalTeamCount(): Promise<number> {
    const NBA_TEAMS = [
      "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets",
      "Chicago Bulls", "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets",
      "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
      "LA Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat",
      "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
      "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns",
      "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors",
      "Utah Jazz", "Washington Wizards",
    ];
    const G_LEAGUE_TEAMS = [
      "Austin Spurs", "Birmingham Squadron", "Capital City Go-Go", "Cleveland Charge",
      "College Park Skyhawks", "Delaware Blue Coats", "Fort Wayne Mad Ants", "Grand Rapids Gold",
      "Greensboro Swarm", "Iowa Wolves", "Lakeland Magic", "Long Island Nets",
      "Maine Celtics", "Memphis Hustle", "Mexico City Capitanes", "Motor City Cruise",
      "Oklahoma City Blue", "Osceola Magic", "Raptors 905", "Rio Grande Valley Vipers",
      "Salt Lake City Stars", "Santa Cruz Warriors", "Sioux Falls Skyforce", "South Bay Lakers",
      "Stockton Kings", "Texas Legends", "Westchester Knicks", "Windy City Bulls", "Wisconsin Herd",
    ];
    const dbTeams = await db
      .selectDistinct({ team: playerStats.team })
      .from(playerStats);
    const allTeams = new Set([...NBA_TEAMS, ...G_LEAGUE_TEAMS, ...dbTeams.map(t => t.team)]);
    return allTeams.size;
  }

  async getFeaturedPlayerIds(): Promise<number[]> {
    const list = await this.getFeaturedPlayers();
    return list.map((p) => Number(p.id)).filter((n) => !Number.isNaN(n));
  }

  async setFeaturedPlayerIds(ids: number[]): Promise<void> {
    const value = JSON.stringify(ids);
    await db.insert(siteSettings).values({ key: "featured_players", value })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value } });
  }

  /** Returns stored snapshot (array of player objects). If value is legacy array of ids, returns []. */
  async getFeaturedPlayers(): Promise<Player[]> {
    const row = await db.select().from(siteSettings).where(eq(siteSettings.key, "featured_players")).limit(1);
    if (row.length === 0) return [];
    try {
      const raw = JSON.parse(row[0].value);
      if (!Array.isArray(raw) || raw.length === 0) return [];
      const first = raw[0];
      if (typeof first === "number") return []; // legacy: stored as ids only
      if (first && typeof first === "object" && "id" in first && "name" in first) return raw as Player[];
      return [];
    } catch {
      return [];
    }
  }

  async setFeaturedPlayersSnapshot(players: (Player & { player_id?: string | null })[]): Promise<void> {
    const list = (players || []).slice(0, 5).map((p) => ({
      id: p.id,
      player_id: (p as Record<string, unknown>).player_id ?? null,
      name: p.name,
      position: p.position ?? "",
      team: p.team ?? "",
      height: p.height ?? "",
      weight: p.weight ?? "",
      jerseyNumber: Number(p.jerseyNumber) || 0,
      headshotUrl: p.headshotUrl ?? "",
      bio: p.bio ?? null,
      profileViews: Number(p.profileViews) || 50,
      hometown: p.hometown ?? null,
      birthDate: p.birthDate ?? null,
    }));
    const value = JSON.stringify(list);
    await db.insert(siteSettings).values({ key: "featured_players", value })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value } });
  }
}

export const storage = new DatabaseStorage();

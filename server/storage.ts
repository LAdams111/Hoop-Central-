import { players, playerStats, awards, teamRecords, type Player, type InsertPlayer, type PlayerStats, type InsertPlayerStats, type Award, type InsertAward, type TeamRecord, type InsertTeamRecord } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, sql, and } from "drizzle-orm";

export interface IStorage {
  // Players
  getPlayers(search?: string, position?: string, sortBy?: "views" | "name"): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
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

  // League Teams
  getTeamsByLeague(league: string): Promise<{ team: string; season: string }[]>;
  getTotalTeamCount(): Promise<number>;
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

  async getRoster(team: string, season: string): Promise<Player[]> {
    const teamLower = team.toLowerCase();
    const results = await db
      .select({ player: players })
      .from(players)
      .innerJoin(playerStats, eq(players.id, playerStats.playerId))
      .where(
        sql`LOWER(${playerStats.team}) = ${teamLower} AND ${playerStats.season} = ${season}`
      );
    const seen = new Set<number>();
    return results.map(r => r.player).filter(p => {
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
      .where(sql`${players.birthDate} IS NOT NULL AND (CURRENT_DATE - ${players.birthDate}::date) / 365.25 < ${maxAge}`)
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
}

export const storage = new DatabaseStorage();

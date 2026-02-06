import { players, playerStats, type Player, type InsertPlayer, type PlayerStats, type InsertPlayerStats } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, sql } from "drizzle-orm";

export interface IStorage {
  // Players
  getPlayers(search?: string, position?: string): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  incrementPlayerViews(id: number): Promise<void>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  // Stats
  getPlayerStats(playerId: number): Promise<PlayerStats[]>;
  getRoster(team: string, season: string): Promise<Player[]>;
  createPlayerStats(stats: InsertPlayerStats): Promise<PlayerStats>;
}

export class DatabaseStorage implements IStorage {
  async getPlayers(search?: string, position?: string): Promise<Player[]> {
    let query = db.select().from(players);
    
    if (search) {
      query = query.where(ilike(players.name, `%${search}%`)) as any;
    }
    
    if (position) {
      // If we already have a where clause (from search), we need to handle it.
      // But simple Drizzle chaining usually works as AND. 
      // For simplicity in this basic implementation:
      // We will filter in memory if both are present to avoid complex dynamic query building 
      // in this quick setup, OR just chain .where() which appends AND.
      // Let's try chaining.
      query = query.where(eq(players.position, position)) as any;
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
    const results = await db
      .select({ player: players })
      .from(players)
      .innerJoin(playerStats, eq(players.id, playerStats.playerId))
      .where(
        sql`${playerStats.team} = ${team} AND ${playerStats.season} = ${season}`
      );
    return results.map(r => r.player);
  }

  async createPlayerStats(insertStats: InsertPlayerStats): Promise<PlayerStats> {
    const [stats] = await db.insert(playerStats).values(insertStats).returning();
    return stats;
  }
}

export const storage = new DatabaseStorage();

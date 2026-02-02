import { players, playerStats, type Player, type InsertPlayer, type PlayerStats, type InsertPlayerStats } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or } from "drizzle-orm";

export interface IStorage {
  // Players
  getPlayers(search?: string, position?: string): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  // Stats
  getPlayerStats(playerId: number): Promise<PlayerStats[]>;
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

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db.insert(players).values(insertPlayer).returning();
    return player;
  }

  async getPlayerStats(playerId: number): Promise<PlayerStats[]> {
    return await db.select().from(playerStats).where(eq(playerStats.playerId, playerId));
  }

  async createPlayerStats(insertStats: InsertPlayerStats): Promise<PlayerStats> {
    const [stats] = await db.insert(playerStats).values(insertStats).returning();
    return stats;
  }
}

export const storage = new DatabaseStorage();

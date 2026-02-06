import { pgTable, text, serial, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: text("position").notNull(), // PG, SG, SF, PF, C
  team: text("team").notNull(),
  height: text("height").notNull(), // e.g., "6'6""
  weight: text("weight").notNull(), // e.g., "198 lbs"
  jerseyNumber: integer("jersey_number").notNull(),
  headshotUrl: text("headshot_url").notNull(),
  bio: text("bio"),
  profileViews: integer("profile_views").default(0).notNull(),
  hometown: text("hometown"),
  birthDate: text("birth_date"),
});

export const playerStats = pgTable("player_stats", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  season: text("season").notNull(), // e.g., "2023-24"
  team: text("team").notNull().default("NBA"), 
  league: text("league").notNull().default("NBA"), // Added league field
  gamesPlayed: integer("games_played").notNull(),
  pointsPerGame: numeric("ppg").notNull(),
  reboundsPerGame: numeric("rpg").notNull(),
  assistsPerGame: numeric("apg").notNull(),
  stealsPerGame: numeric("spg").notNull(),
  blocksPerGame: numeric("bpg").notNull(),
  fieldGoalPct: numeric("fg_pct").notNull(),
});

export const awards = pgTable("awards", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  name: text("name").notNull(),
  year: text("year").notNull(),
});

export const playersRelations = relations(players, ({ many }) => ({
  stats: many(playerStats),
  awards: many(awards),
}));

export const playerStatsRelations = relations(playerStats, ({ one }) => ({
  player: one(players, {
    fields: [playerStats.playerId],
    references: [players.id],
  }),
}));

export const awardsRelations = relations(awards, ({ one }) => ({
  player: one(players, {
    fields: [awards.playerId],
    references: [players.id],
  }),
}));

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export const insertPlayerStatsSchema = createInsertSchema(playerStats).omit({ id: true });
export const insertAwardSchema = createInsertSchema(awards).omit({ id: true });

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type PlayerStats = typeof playerStats.$inferSelect;
export type InsertPlayerStats = z.infer<typeof insertPlayerStatsSchema>;
export type Award = typeof awards.$inferSelect;
export type InsertAward = z.infer<typeof insertAwardSchema>;

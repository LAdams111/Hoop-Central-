/**
 * Canonical schema matching the live DB (schema.sql).
 * Scrapers write here; no sync to legacy tables (player_info/player_stats removed).
 */
import { pgTable, text, serial, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/** Leagues: NBA, NCAA, etc. */
export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country"),
});

/** Teams (pro or school). */
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  abbreviation: text("abbreviation"),
  leagueId: integer("league_id").references(() => leagues.id),
});

/** Seasons per league: year_start/year_end (e.g. 2024–2025). */
export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull().references(() => leagues.id),
  yearStart: integer("year_start").notNull(),
  yearEnd: integer("year_end").notNull(),
});

/** Team + season (wins/losses optional). */
export const teamSeasons = pgTable("team_seasons", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id),
  seasonId: integer("season_id").notNull().references(() => seasons.id),
  wins: integer("wins"),
  losses: integer("losses"),
});

/** Core identity: one row per player. */
export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  birthDate: date("birth_date"),
  heightCm: integer("height_cm"),
  weightKg: integer("weight_kg"),
  position: text("position"),
  nationality: text("nationality"),
  createdAt: timestamp("created_at").defaultNow(),
  birthPlace: text("birth_place"),
  srPlayerId: text("sr_player_id"),
});

/** External IDs for scrapers; prevents duplicate players across sources. */
export const playerExternalIds = pgTable("player_external_ids", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  externalId: text("external_id").notNull(),
});

/** Where a player played (player + team_season). */
export const playerSeasons = pgTable("player_seasons", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id),
  teamSeasonId: integer("team_season_id").notNull().references(() => teamSeasons.id),
  jerseyNumber: integer("jersey_number"),
  gamesPlayed: integer("games_played"),
});

/** Per-season stats; one row per player_season. Totals and percentages. */
export const playerSeasonStats = pgTable("player_season_stats", {
  id: serial("id").primaryKey(),
  playerSeasonId: integer("player_season_id").notNull().references(() => playerSeasons.id, { onDelete: "cascade" }),
  games: integer("games"),
  minutes: integer("minutes"),
  points: integer("points"),
  rebounds: integer("rebounds"),
  assists: integer("assists"),
  steals: integer("steals"),
  blocks: integer("blocks"),
  fgPct: numeric("fg_pct"),
  threePct: numeric("three_pct"),
  ftPct: numeric("ft_pct"),
});

/** Scrape job queue (optional: scraper can enqueue player URLs here). */
export const playerScrapeJobs = pgTable("player_scrape_jobs", {
  id: serial("id").primaryKey(),
  playerUrl: text("player_url").notNull().unique(),
  status: text("status").default("pending"),
  attempts: integer("attempts").default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---- Relations ----
export const leaguesRelations = relations(leagues, ({ many }) => ({
  teams: many(teams),
  seasons: many(seasons),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  league: one(leagues, { fields: [teams.leagueId], references: [leagues.id] }),
  teamSeasons: many(teamSeasons),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  league: one(leagues, { fields: [seasons.leagueId], references: [leagues.id] }),
  teamSeasons: many(teamSeasons),
}));

export const teamSeasonsRelations = relations(teamSeasons, ({ one, many }) => ({
  team: one(teams, { fields: [teamSeasons.teamId], references: [teams.id] }),
  season: one(seasons, { fields: [teamSeasons.seasonId], references: [seasons.id] }),
  playerSeasons: many(playerSeasons),
}));

export const playersRelations = relations(players, ({ many }) => ({
  externalIds: many(playerExternalIds),
  playerSeasons: many(playerSeasons),
}));

export const playerExternalIdsRelations = relations(playerExternalIds, ({ one }) => ({
  player: one(players, { fields: [playerExternalIds.playerId], references: [players.id] }),
}));

export const playerSeasonsRelations = relations(playerSeasons, ({ one, many }) => ({
  player: one(players, { fields: [playerSeasons.playerId], references: [players.id] }),
  teamSeason: one(teamSeasons, { fields: [playerSeasons.teamSeasonId], references: [teamSeasons.id] }),
  stats: many(playerSeasonStats),
}));

export const playerSeasonStatsRelations = relations(playerSeasonStats, ({ one }) => ({
  playerSeason: one(playerSeasons, { fields: [playerSeasonStats.playerSeasonId], references: [playerSeasons.id] }),
}));

// ---- Types ----
export type League = typeof leagues.$inferSelect;
export type InsertLeague = typeof leagues.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type InsertSeason = typeof seasons.$inferInsert;
export type TeamSeason = typeof teamSeasons.$inferSelect;
export type InsertTeamSeason = typeof teamSeasons.$inferInsert;
export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;
export type PlayerExternalId = typeof playerExternalIds.$inferSelect;
export type PlayerSeason = typeof playerSeasons.$inferSelect;
export type InsertPlayerSeason = typeof playerSeasons.$inferInsert;
export type PlayerSeasonStat = typeof playerSeasonStats.$inferSelect;
export type InsertPlayerSeasonStat = typeof playerSeasonStats.$inferInsert;

/** @deprecated Use Player */
export type CanonicalPlayer = Player;
/** @deprecated Use InsertPlayer */
export type InsertCanonicalPlayer = InsertPlayer;

/**
 * Canonical sports-database schema (EliteProspects / Basketball Reference style).
 * Scrapers write here; sync layer copies to player_info / player_stats for the frontend.
 */
import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/** Core identity: one row per player. */
export const canonicalPlayers = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  birthDate: text("birth_date"),
  height: text("height").notNull().default("—"),
  weight: text("weight").notNull().default("—"),
  position: text("position").notNull().default("G"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** External IDs for scrapers; prevents duplicate players across sources. */
export const playerExternalIds = pgTable("player_external_ids", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => canonicalPlayers.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // e.g. "sports_reference", "nba"
  externalId: text("external_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Leagues: NCAA, NBA, EuroLeague, G League, etc. */
export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").default("USA"),
  level: text("level"), // e.g. "college", "pro"
});

/** Teams (schools or pro teams). */
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  leagueId: integer("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  school: text("school"), // for NCAA
  city: text("city"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Seasons: 2024-25, 2023-24, etc. */
export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  yearStart: integer("year_start").notNull(),
  yearEnd: integer("year_end").notNull(),
  label: text("label").notNull(), // e.g. "2024-25"
});

/** Where a player played (player + team + league + season). */
export const playerSeasons = pgTable("player_seasons", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => canonicalPlayers.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  leagueId: integer("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  jersey: integer("jersey").default(0),
  games: integer("games").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Per-season stats; one row per player_season. */
export const playerSeasonStats = pgTable("player_season_stats", {
  id: serial("id").primaryKey(),
  playerSeasonId: integer("player_season_id").notNull().references(() => playerSeasons.id, { onDelete: "cascade" }),
  ptsPerG: numeric("pts_per_g").notNull().default("0"),
  trbPerG: numeric("trb_per_g").notNull().default("0"),
  astPerG: numeric("ast_per_g").notNull().default("0"),
  stlPerG: numeric("stl_per_g").notNull().default("0"),
  blkPerG: numeric("blk_per_g").notNull().default("0"),
  fgPct: numeric("fg_pct").notNull().default("0"),
  fg3Pct: numeric("fg3_pct"),
  ftPct: numeric("ft_pct"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const canonicalPlayersRelations = relations(canonicalPlayers, ({ many }) => ({
  externalIds: many(playerExternalIds),
  playerSeasons: many(playerSeasons),
}));

export const playerExternalIdsRelations = relations(playerExternalIds, ({ one }) => ({
  player: one(canonicalPlayers, {
    fields: [playerExternalIds.playerId],
    references: [canonicalPlayers.id],
  }),
}));

export const leaguesRelations = relations(leagues, ({ many }) => ({
  teams: many(teams),
  playerSeasons: many(playerSeasons),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  league: one(leagues, { fields: [teams.leagueId], references: [leagues.id] }),
  playerSeasons: many(playerSeasons),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
  playerSeasons: many(playerSeasons),
}));

export const playerSeasonsRelations = relations(playerSeasons, ({ one, many }) => ({
  player: one(canonicalPlayers, { fields: [playerSeasons.playerId], references: [canonicalPlayers.id] }),
  team: one(teams, { fields: [playerSeasons.teamId], references: [teams.id] }),
  league: one(leagues, { fields: [playerSeasons.leagueId], references: [leagues.id] }),
  season: one(seasons, { fields: [playerSeasons.seasonId], references: [seasons.id] }),
  stats: many(playerSeasonStats),
}));

export const playerSeasonStatsRelations = relations(playerSeasonStats, ({ one }) => ({
  playerSeason: one(playerSeasons, { fields: [playerSeasonStats.playerSeasonId], references: [playerSeasons.id] }),
}));

export type CanonicalPlayer = typeof canonicalPlayers.$inferSelect;
export type InsertCanonicalPlayer = typeof canonicalPlayers.$inferInsert;
export type PlayerExternalId = typeof playerExternalIds.$inferSelect;
export type League = typeof leagues.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type PlayerSeason = typeof playerSeasons.$inferSelect;
export type PlayerSeasonStat = typeof playerSeasonStats.$inferSelect;

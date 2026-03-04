/**
 * League/season/team lookups for canonical schema. Get-or-create so scrapers can reference by name/label.
 */
import { db } from "../db";
import {
  leagues,
  teams,
  seasons,
  type League,
  type Team,
  type Season,
} from "@shared/canonicalSchema";
import { eq, and } from "drizzle-orm";

const NCAA_LEAGUE_ID = 1;
const NBA_LEAGUE_ID = 2;
const G_LEAGUE_ID = 3;

export async function getOrCreateLeague(name: string, country = "USA", level?: string): Promise<League> {
  const normalized = name.trim();
  const [existing] = await db.select().from(leagues).where(eq(leagues.name, normalized)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(leagues).values({ name: normalized, country, level }).returning();
  return created!;
}

export async function getLeagueById(id: number): Promise<League | undefined> {
  const [row] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1);
  return row;
}

export async function getNcaaLeague(): Promise<League> {
  let [row] = await db.select().from(leagues).where(eq(leagues.id, NCAA_LEAGUE_ID)).limit(1);
  if (!row) {
    [row] = await db.insert(leagues).values({ id: NCAA_LEAGUE_ID, name: "NCAA", country: "USA", level: "college" }).returning();
  }
  return row!;
}

export async function getNbaLeague(): Promise<League> {
  let [row] = await db.select().from(leagues).where(eq(leagues.id, NBA_LEAGUE_ID)).limit(1);
  if (!row) {
    [row] = await db.insert(leagues).values({ id: NBA_LEAGUE_ID, name: "NBA", country: "USA", level: "pro" }).returning();
  }
  return row!;
}

export async function getOrCreateTeam(name: string, slug: string, leagueId: number, school?: string, city?: string): Promise<Team> {
  const nameNorm = name.trim();
  const slugNorm = slug.trim().toLowerCase().replace(/\s+/g, "-");
  const [existing] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.leagueId, leagueId), eq(teams.slug, slugNorm)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(teams)
    .values({ name: nameNorm, slug: slugNorm, leagueId, school: school ?? null, city: city ?? null })
    .returning();
  return created!;
}

export async function getOrCreateSeason(yearStart: number, yearEnd: number, label: string): Promise<Season> {
  const [existing] = await db.select().from(seasons).where(eq(seasons.label, label)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(seasons).values({ yearStart, yearEnd, label }).returning();
  return created!;
}

/** e.g. 2024 -> "2024-25" and get/create season row */
export async function getOrCreateSeasonByEndYear(endYear: number): Promise<Season> {
  const startYear = endYear - 1;
  const label = `${startYear}-${String(endYear).slice(-2)}`;
  return getOrCreateSeason(startYear, endYear, label);
}

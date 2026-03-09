/**
 * League/season/team lookups for canonical schema. Get-or-create so scrapers can reference by name/abbreviation.
 */
import { db } from "../db";
import {
  leagues,
  teams,
  seasons,
  teamSeasons,
  type League,
  type Team,
  type Season,
  type TeamSeason,
} from "@shared/canonicalSchema";
import { eq, and } from "drizzle-orm";

const NBA_LEAGUE_NAME = "NBA";
const NCAA_LEAGUE_NAME = "NCAA";
const WNBA_LEAGUE_NAME = "WNBA";

export async function getOrCreateLeague(name: string, country: string | null = "USA"): Promise<League> {
  const normalized = name.trim();
  const [existing] = await db.select().from(leagues).where(eq(leagues.name, normalized)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(leagues).values({ name: normalized, country }).returning();
  return created!;
}

export async function getLeagueById(id: number): Promise<League | undefined> {
  const [row] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1);
  return row;
}

export async function getNbaLeague(): Promise<League> {
  return getOrCreateLeague(NBA_LEAGUE_NAME);
}

export async function getNcaaLeague(): Promise<League> {
  return getOrCreateLeague(NCAA_LEAGUE_NAME);
}

export async function getWnbaLeague(): Promise<League> {
  return getOrCreateLeague(WNBA_LEAGUE_NAME);
}

/** Find team by name + league, or by abbreviation + league. Create if missing. */
export async function getOrCreateTeam(
  name: string,
  leagueId: number,
  options?: { abbreviation?: string; city?: string }
): Promise<Team> {
  const nameNorm = name.trim();
  const abbr = options?.abbreviation?.trim().toUpperCase();
  const [existingByName] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.leagueId, leagueId), eq(teams.name, nameNorm)))
    .limit(1);
  if (existingByName) return existingByName;
  if (abbr) {
    const [existingByAbbr] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.leagueId, leagueId), eq(teams.abbreviation, abbr)))
      .limit(1);
    if (existingByAbbr) return existingByAbbr;
  }
  const [created] = await db
    .insert(teams)
    .values({
      name: nameNorm,
      leagueId,
      abbreviation: abbr ?? null,
      city: options?.city ?? null,
    })
    .returning();
  return created!;
}

/** Get or create season by league + year range. */
export async function getOrCreateSeason(leagueId: number, yearStart: number, yearEnd: number): Promise<Season> {
  const [existing] = await db
    .select()
    .from(seasons)
    .where(
      and(
        eq(seasons.leagueId, leagueId),
        eq(seasons.yearStart, yearStart),
        eq(seasons.yearEnd, yearEnd)
      )
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(seasons)
    .values({ leagueId, yearStart, yearEnd })
    .returning();
  return created!;
}

/** e.g. 2025 -> season 2024–2025; get or create for NBA. */
export async function getOrCreateSeasonByEndYear(leagueId: number, endYear: number): Promise<Season> {
  const startYear = endYear - 1;
  return getOrCreateSeason(leagueId, startYear, endYear);
}

/** Get or create team_season row for a team + season. */
export async function getOrCreateTeamSeason(
  teamId: number,
  seasonId: number,
  options?: { wins?: number; losses?: number }
): Promise<TeamSeason> {
  const [existing] = await db
    .select()
    .from(teamSeasons)
    .where(and(eq(teamSeasons.teamId, teamId), eq(teamSeasons.seasonId, seasonId)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(teamSeasons)
    .values({
      teamId,
      seasonId,
      wins: options?.wins ?? null,
      losses: options?.losses ?? null,
    })
    .returning();
  return created!;
}

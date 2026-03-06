/**
 * Canonical player identity: find or create by external ID to prevent duplicates.
 * Writes to players + player_external_ids (full_name, height_cm, weight_kg, etc.).
 */
import { db } from "../db";
import {
  players,
  playerExternalIds,
  type Player,
  type InsertPlayer,
} from "@shared/canonicalSchema";
import { eq, and } from "drizzle-orm";

/** Parse "6'7\"" or "6-7" to cm. Returns null if unparseable. */
export function parseHeightToCm(height: string | null | undefined): number | null {
  if (!height || typeof height !== "string") return null;
  const trimmed = height.trim();
  const ftIn = trimmed.match(/^(\d+)[\'\-](\d+)\s*"?$/); // 6'7" or 6-7
  if (ftIn) {
    const ft = parseInt(ftIn[1], 10);
    const inch = parseInt(ftIn[2], 10);
    return Math.round((ft * 30.48) + (inch * 2.54));
  }
  const cm = trimmed.match(/^(\d+)\s*cm$/i);
  if (cm) return parseInt(cm[1], 10);
  return null;
}

/** Parse "200 lbs" or "90 kg" to kg. Returns null if unparseable. */
export function parseWeightToKg(weight: string | null | undefined): number | null {
  if (!weight || typeof weight !== "string") return null;
  const trimmed = weight.trim();
  const lbs = trimmed.match(/^(\d+(?:\.\d+)?)\s*lbs?$/i);
  if (lbs) return Math.round(parseFloat(lbs[1]) * 0.453592);
  const kg = trimmed.match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  if (kg) return Math.round(parseFloat(kg[1]));
  return null;
}

/** Split "First Last" into first and last (best-effort). */
function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

/**
 * Find canonical player by external id (e.g. source=nba, external_id=lebron-james).
 */
export async function findPlayerByExternalId(source: string, externalId: string): Promise<Player | null> {
  const extNorm = String(externalId || "").trim();
  if (!extNorm) return null;
  const [row] = await db
    .select({ player: players })
    .from(playerExternalIds)
    .innerJoin(players, eq(players.id, playerExternalIds.playerId))
    .where(and(eq(playerExternalIds.source, source), eq(playerExternalIds.externalId, extNorm)))
    .limit(1);
  return row?.player ?? null;
}

/**
 * Find or create player. If externalId is provided, looks up by external_id first.
 * Uses full_name, first_name, last_name, height_cm, weight_kg, position; sr_player_id set from externalId when source is bbref/nba.
 */
export async function findOrCreatePlayer(params: {
  name: string;
  birthDate?: string | null;
  height?: string | null;
  weight?: string | null;
  position?: string | null;
  source?: string;
  externalId?: string;
  nationality?: string | null;
  birthPlace?: string | null;
}): Promise<{ player: Player; created: boolean }> {
  const { name, source, externalId } = params;
  if (source && externalId) {
    const existing = await findPlayerByExternalId(source, externalId);
    if (existing) {
      const updates: Partial<InsertPlayer> = {};
      if (params.birthDate != null) updates.birthDate = params.birthDate;
      if (params.height != null) updates.heightCm = parseHeightToCm(params.height);
      if (params.weight != null) updates.weightKg = parseWeightToKg(params.weight);
      if (params.position != null) updates.position = params.position;
      if (params.nationality != null) updates.nationality = params.nationality;
      if (params.birthPlace != null) updates.birthPlace = params.birthPlace;
      if (params.source === "nba" && params.externalId) updates.srPlayerId = params.externalId;
      if (Object.keys(updates).length > 0) {
        const [updated] = await db
          .update(players)
          .set(updates)
          .where(eq(players.id, existing.id))
          .returning();
        return { player: updated ?? existing, created: false };
      }
      return { player: existing, created: false };
    }
  }

  const fullName = name.trim();
  const { firstName, lastName } = splitName(fullName);
  const heightCm = parseHeightToCm(params.height);
  const weightKg = parseWeightToKg(params.weight);
  const [player] = await db
    .insert(players)
    .values({
      fullName,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      birthDate: params.birthDate ?? null,
      heightCm: heightCm ?? null,
      weightKg: weightKg ?? null,
      position: params.position ?? null,
      nationality: params.nationality ?? null,
      birthPlace: params.birthPlace ?? null,
      srPlayerId: source === "nba" && externalId ? externalId : null,
    })
    .returning();
  if (!player) throw new Error("Failed to create player");

  if (source && externalId) {
    await db
      .insert(playerExternalIds)
      .values({
        playerId: player.id,
        source,
        externalId: String(externalId).trim(),
      })
      .onConflictDoNothing({ target: [playerExternalIds.source, playerExternalIds.externalId] });
  }
  return { player, created: true };
}

export async function getCanonicalPlayerById(id: number): Promise<Player | null> {
  const [row] = await db.select().from(players).where(eq(players.id, id)).limit(1);
  return row ?? null;
}

/** Extract sports-reference slug from player URL (e.g. /cbb/players/patrick-ngongba-1.html -> patrick-ngongba-1) */
export function sportsRefSlugFromPlayerUrl(playerUrl: string): string | null {
  if (!playerUrl || typeof playerUrl !== "string") return null;
  const match = playerUrl.match(/\/cbb\/players\/([^/?#]+?)(?:\.html)?$/i);
  return match ? match[1].trim() : null;
}

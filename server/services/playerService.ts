/**
 * Canonical player identity: find or create by external ID to prevent duplicates.
 */
import { db } from "../db";
import {
  canonicalPlayers,
  playerExternalIds,
  type CanonicalPlayer,
  type InsertCanonicalPlayer,
} from "@shared/canonicalSchema";
import { eq, and, sql } from "drizzle-orm";

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Find canonical player by external id (e.g. source=sports_reference, external_id=patrick-ngongba-1).
 * Returns null if not found.
 */
export async function findPlayerByExternalId(source: string, externalId: string): Promise<CanonicalPlayer | null> {
  const extNorm = String(externalId || "").trim();
  if (!extNorm) return null;
  const [row] = await db
    .select({ player: canonicalPlayers })
    .from(playerExternalIds)
    .innerJoin(canonicalPlayers, eq(canonicalPlayers.id, playerExternalIds.playerId))
    .where(and(eq(playerExternalIds.source, source), eq(playerExternalIds.externalId, extNorm)))
    .limit(1);
  return row?.player ?? null;
}

/**
 * Find or create canonical player. If externalId is provided, looks up by external_id first.
 * Returns the player and whether it was just created.
 */
export async function findOrCreatePlayer(params: {
  name: string;
  birthDate?: string | null;
  height?: string;
  weight?: string;
  position?: string;
  source?: string;
  externalId?: string;
}): Promise<{ player: CanonicalPlayer; created: boolean }> {
  const { name, source, externalId } = params;
  if (source && externalId) {
    const existing = await findPlayerByExternalId(source, externalId);
    if (existing) {
      const updates: Partial<InsertCanonicalPlayer> = {};
      if (params.birthDate != null) updates.birthDate = params.birthDate;
      if (params.height != null) updates.height = params.height;
      if (params.weight != null) updates.weight = params.weight;
      if (params.position != null) updates.position = params.position;
      if (Object.keys(updates).length > 0) {
        const [updated] = await db
          .update(canonicalPlayers)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(canonicalPlayers.id, existing.id))
          .returning();
        return { player: updated ?? existing, created: false };
      }
      return { player: existing, created: false };
    }
  }

  const baseSlug = slugFromName(name);
  let slug = baseSlug;
  let suffix = 0;
  while (true) {
    const [collision] = await db.select().from(canonicalPlayers).where(eq(canonicalPlayers.slug, slug)).limit(1);
    if (!collision) break;
    slug = `${baseSlug}-${++suffix}`;
  }

  const [player] = await db
    .insert(canonicalPlayers)
    .values({
      name: name.trim(),
      slug,
      birthDate: params.birthDate ?? null,
      height: params.height ?? "—",
      weight: params.weight ?? "—",
      position: params.position ?? "G",
    })
    .returning();
  if (!player) throw new Error("Failed to create canonical player");

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

export async function getCanonicalPlayerById(id: number): Promise<CanonicalPlayer | null> {
  const [row] = await db.select().from(canonicalPlayers).where(eq(canonicalPlayers.id, id)).limit(1);
  return row ?? null;
}

/** Extract sports-reference slug from player URL (e.g. /cbb/players/patrick-ngongba-1.html -> patrick-ngongba-1) */
export function sportsRefSlugFromPlayerUrl(playerUrl: string): string | null {
  if (!playerUrl || typeof playerUrl !== "string") return null;
  const match = playerUrl.match(/\/cbb\/players\/([^/?#]+?)(?:\.html)?$/i);
  return match ? match[1].trim() : null;
}

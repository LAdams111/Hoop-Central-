import type { Express } from "express";
import type { Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { pool } from "./db";
import { api } from "@shared/routes";
import { scrapeNBAPlayers, updatePlayerBios, isBioScraperRunning } from "./scraper";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { syncPlayerInfoFromPostgres, getPlayerInfoRows, getPlayerInfoById, getPlayerInfoByPlayerId, getRosterFromExternalTableViaJoin, getRosterFromExternalTable, getPlayersByBirthYearFromExternalTable, getBirthYearCountsFromExternalTable, getProspectsFromExternalTable, insertPlayerStatsRow, insertIntoPlayerInfo, getPlayerInfoCount, incrementProfileViewsByPlayerId, setExternalProfileViewsById, setExternalHeadshotById, getExternalProfileViewsById, incrementExternalProfileViewsById } from "./syncPlayerInfo";

/** Ensure player object has birthDate and hometown in camelCase for the frontend (Postgres/pg often returns snake_case). */
function normalizePlayerForApi<T extends Record<string, unknown>>(p: T): T {
  const birthDate = p.birthDate ?? (p as Record<string, unknown>).birth_date ?? null;
  const hometown = p.hometown ?? (p as Record<string, unknown>).birth_place ?? null;
  return { ...p, birthDate, hometown } as T;
}

const ADMIN_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getAdminSecret(): string {
  return process.env.ADMIN_PASSWORD || process.env.SESSION_SECRET || "Hockey86";
}

/** Create a signed admin token that survives server restarts (e.g. Railway deploy). */
function createSignedAdminToken(): string {
  const secret = getAdminSecret();
  const payload = JSON.stringify({ admin: true, exp: Date.now() + ADMIN_TOKEN_TTL_MS });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/** Returns true if the token is valid (password, in-memory session, or valid signed token). */
function isValidAdminToken(token: string | undefined): boolean {
  if (!token?.trim()) return false;
  const secret = getAdminSecret();
  // Accept raw admin password so no token is required (works across restarts)
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(secret, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  } catch {
    /* ignore */
  }
  if (adminSessions.has(token)) return true;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  try {
    const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
    if (expectedSig !== sig) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return payload?.admin === true && typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export const adminSessions = new Set<string>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    const adminPassword = getAdminSecret();
    if (!adminPassword || password !== adminPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }
    const token = createSignedAdminToken();
    adminSessions.add(token);
    res.json({ token });
  });

  app.get("/api/admin/check", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!isValidAdminToken(token)) {
      return res.status(401).json({ authenticated: false });
    }
    res.json({ authenticated: true });
  });

  // Debug: verify app is reading from the same DB (table "player_info")
  app.get("/api/debug/players-count", async (_req, res) => {
    try {
      const count = await storage.getPlayerCount();
      res.json({ table: "player_info", count, ok: true });
    } catch (e) {
      res.status(500).json({ table: "player_info", count: null, ok: false, error: String(e) });
    }
  });

  // Sync from Postgres "Player info" table into app's player_info table (creates/updates profiles)
  app.post("/api/sync/player-info", async (_req, res) => {
    try {
      const result = await syncPlayerInfoFromPostgres();
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e), created: 0, updated: 0, errors: [] });
    }
  });
  app.get("/api/sync/player-info", async (_req, res) => {
    try {
      const result = await syncPlayerInfoFromPostgres();
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e), created: 0, updated: 0, errors: [] });
    }
  });

  app.get("/api/featured-players", async (_req, res) => {
    try {
      const ids = await storage.getFeaturedPlayerIds();
      if (ids.length === 0) {
        res.json([]);
        return;
      }
      const fromApp = await storage.getFeaturedPlayers();
      const byId = new Map<number, Record<string, unknown>>();
      for (const p of fromApp) {
        byId.set(Number(p.id), { ...p });
      }
      for (const id of ids) {
        if (byId.has(id)) continue;
        const external = await getPlayerInfoById(id);
        if (external) {
          byId.set(id, {
            id: external.id,
            name: external.name,
            position: external.position,
            team: external.team,
            height: external.height,
            weight: external.weight,
            jerseyNumber: external.jerseyNumber,
            headshotUrl: external.headshotUrl || "",
            bio: external.bio ?? null,
            profileViews: external.profileViews ?? 50,
            hometown: external.hometown ?? null,
            birthDate: external.birthDate ?? null,
          });
        }
      }
      const list = ids.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
      res.json(list.map((p) => normalizePlayerForApi(p)));
    } catch {
      res.json([]);
    }
  });

  app.get("/api/featured-player-ids", async (_req, res) => {
    try {
      const ids = await storage.getFeaturedPlayerIds();
      res.json(ids);
    } catch {
      res.json([]);
    }
  });

  const railwayScraperBase = process.env.RAILWAY_SCRAPER_URL || "https://hoop-central-scraper-production.up.railway.app";

  app.get("/api/railway/player/:bbrefId", async (req, res) => {
    const bbrefId = (req.params.bbrefId || "").trim();
    if (!bbrefId || !/^[a-z0-9]+$/i.test(bbrefId)) {
      return res.status(400).json({ message: "Invalid player ID (use Basketball-Reference ID, e.g. jamesle01)" });
    }
    try {
      const response = await fetch(`${railwayScraperBase}/api/player/${encodeURIComponent(bbrefId)}`);
      if (!response.ok) {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          return res.status(response.status).json(json);
        } catch {
          return res.status(response.status).json({ message: text || "Scraper request failed" });
        }
      }
      const data = await response.json();
      res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reach Railway scraper";
      res.status(502).json({ message });
    }
  });

  const ingestSecret = process.env.INGEST_SECRET;

  app.post("/api/ingest/players", async (req, res) => {
    if (ingestSecret) {
      const provided = req.headers["x-ingest-secret"] || req.query.secret;
      if (provided !== ingestSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    const raw = req.body?.players ?? req.body;
    const list = Array.isArray(raw) ? raw : [];
    if (list.length === 0) {
      return res.status(400).json({ error: "Expected { players: [ ... ] } with at least one player" });
    }
    const DEFAULT_HEADSHOT = "https://cdn.nba.com/headshots/nba/latest/1040x760/1631244.png";
    const get = (o: any, ...keys: string[]) => {
      for (const k of keys) if (o[k] != null) return String(o[k]);
      return "";
    };
    const getNum = (o: any, ...keys: string[]) => {
      for (const k of keys) {
        const v = o[k];
        if (typeof v === "number" && !Number.isNaN(v)) return v;
        if (typeof v === "string") { const n = parseInt(v, 10); if (!Number.isNaN(n)) return n; }
      }
      return 0;
    };
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const item of list) {
      try {
        const name = get(item, "name", "player_name", "playerName") || "Unknown";
        const team = get(item, "team", "team_name", "teamName") || "—";
        const position = get(item, "position", "pos") || "—";
        const height = get(item, "height", "ht") || "—";
        const weight = get(item, "weight", "wt", "weight_lbs") || "—";
        const jerseyNumber = getNum(item, "jerseyNumber", "jersey_number", "number", "num", "jersey");
        const headshotUrl = get(item, "headshotUrl", "headshot_url", "image", "img") || DEFAULT_HEADSHOT;
        const bio = get(item, "bio", "description") || null;
        const hometown = get(item, "hometown", "birth_place", "birthPlace") || null;
        const birthDate = get(item, "birthDate", "birth_date", "dob") || null;
        const statsRaw = item.stats ?? item.seasons ?? item.career_stats ?? [];
        const statsList = Array.isArray(statsRaw) ? statsRaw : [];

        const existing = await storage.getPlayerByNameAndTeam(name, team);
        if (existing) {
          const hadNbaStatsBefore = await storage.getPlayerHasNbaStats(existing.id);
          await storage.updatePlayer(existing.id, {
            name, position, team, height, weight, jerseyNumber,
            bio: bio || existing.bio,
            hometown: hometown || existing.hometown,
            birthDate: birthDate || existing.birthDate,
          });
          if (headshotUrl) await storage.updatePlayerHeadshot(existing.id, headshotUrl);
          await storage.deletePlayerStats(existing.id);
          updated++;
          for (const s of statsList) {
            const season = get(s, "season", "year", "season_year") || "—";
            const statTeam = get(s, "team", "team_name", "teamName") || team;
            const league = get(s, "league", "lg") || "NBA";
            const gp = getNum(s, "gamesPlayed", "games_played", "gp", "g");
            const ppg = get(s, "pointsPerGame", "ppg", "pts", "points_per_game") || "0";
            const rpg = get(s, "reboundsPerGame", "rpg", "reb", "rebounds_per_game") || "0";
            const apg = get(s, "assistsPerGame", "apg", "ast", "assists_per_game") || "0";
            const spg = get(s, "stealsPerGame", "spg", "stl", "steals_per_game") || "0";
            const bpg = get(s, "blocksPerGame", "bpg", "blk", "blocks_per_game") || "0";
            const fg = get(s, "fieldGoalPct", "fg_pct", "fg%") || "0";
            await storage.createPlayerStats({
              playerId: existing.id,
              season,
              team: statTeam,
              league,
              gamesPlayed: gp || 0,
              pointsPerGame: ppg,
              reboundsPerGame: rpg,
              assistsPerGame: apg,
              stealsPerGame: spg,
              blocksPerGame: bpg,
              fieldGoalPct: fg,
            });
          }
          const addedNbaStats = statsList.some((s: any) => (get(s, "league", "lg") || "NBA").toLowerCase() === "nba");
          if (addedNbaStats && !hadNbaStatsBefore) {
            await storage.addNbaProfileViewsBoost(existing.id);
          }
        } else {
          const hasNbaStats = statsList.some((s: any) => (get(s, "league", "lg") || "NBA").toLowerCase() === "nba");
          const player = await storage.createPlayer({
            name,
            position,
            team,
            height,
            weight,
            jerseyNumber,
            headshotUrl,
            bio,
            hometown,
            birthDate,
            ...(hasNbaStats ? { profileViews: Math.floor(Math.random() * 6001) + 10000 } : {}),
          });
          created++;
          for (const s of statsList) {
            const season = get(s, "season", "year", "season_year") || "—";
            const statTeam = get(s, "team", "team_name", "teamName") || team;
            const league = get(s, "league", "lg") || "NBA";
            const gp = getNum(s, "gamesPlayed", "games_played", "gp", "g");
            const ppg = get(s, "pointsPerGame", "ppg", "pts", "points_per_game") || "0";
            const rpg = get(s, "reboundsPerGame", "rpg", "reb", "rebounds_per_game") || "0";
            const apg = get(s, "assistsPerGame", "apg", "ast", "assists_per_game") || "0";
            const spg = get(s, "stealsPerGame", "spg", "stl", "steals_per_game") || "0";
            const bpg = get(s, "blocksPerGame", "bpg", "blk", "blocks_per_game") || "0";
            const fg = get(s, "fieldGoalPct", "fg_pct", "fg%") || "0";
            await storage.createPlayerStats({
              playerId: player.id,
              season,
              team: statTeam,
              league,
              gamesPlayed: gp || 0,
              pointsPerGame: ppg,
              reboundsPerGame: rpg,
              assistsPerGame: apg,
              stealsPerGame: spg,
              blocksPerGame: bpg,
              fieldGoalPct: fg,
            });
          }
        }
      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    res.json({ created, updated, errors });
  });

  app.post("/api/ingest/player-stats", async (req, res) => {
    if (ingestSecret) {
      const provided = req.headers["x-ingest-secret"] || req.query.secret;
      if (provided !== ingestSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    const raw = req.body?.stats ?? req.body;
    const list = Array.isArray(raw) ? raw : [raw].filter(Boolean);
    if (list.length === 0) {
      return res.status(400).json({ error: "Expected { stats: [ ... ] } or a single stat object with player_id" });
    }
    const get = (o: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) if (o[k] != null) return o[k];
      return undefined;
    };
    let inserted = 0;
    const errors: string[] = [];
    for (const item of list) {
      const player_id = get(item, "player_id", "playerId") as string | undefined;
      if (!player_id) {
        errors.push("Missing player_id");
        continue;
      }
      try {
        await insertPlayerStatsRow({
          player_id: String(player_id),
          season: get(item, "season", "year_id", "year") as string | undefined,
          team: get(item, "team", "team_name_abbr", "teamName") as string | undefined,
          league: get(item, "league", "comp_name_abbr", "league") as string | undefined,
          games: Number(get(item, "games", "gp", "g")) || 0,
          games_started: Number(get(item, "games_started", "gs")) || 0,
          pts_per_g: get(item, "pts_per_g", "ppg", "pts"),
          trb_per_g: get(item, "trb_per_g", "rpg", "reb"),
          ast_per_g: get(item, "ast_per_g", "apg", "ast"),
          stl_per_g: get(item, "stl_per_g", "spg", "stl"),
          blk_per_g: get(item, "blk_per_g", "bpg", "blk"),
          fg_pct: get(item, "fg_pct", "fg%"),
          fg3_pct: get(item, "fg3_pct", "fg3%"),
          ft_pct: get(item, "ft_pct", "ft%"),
        });
        inserted++;
      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    res.json({ inserted, errors });
  });

  app.post("/api/ingest/player-with-stats", async (req, res) => {
    if (ingestSecret) {
      const provided = req.headers["x-ingest-secret"] || req.query.secret;
      if (provided !== ingestSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    const get = (o: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) if (o[k] != null) return o[k];
      return undefined;
    };
    const raw = req.body?.players ?? req.body;
    const list = Array.isArray(raw) ? raw : [raw].filter(Boolean);
    if (list.length === 0) {
      return res.status(400).json({ error: "Expected { players: [ { player_id, name, team, ..., stats: [ ... ] } ] } or single player object." });
    }
    let playersInserted = 0;
    let statsInserted = 0;
    const errors: string[] = [];
    for (const body of list) {
      const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const player_id = get(o, "player_id", "playerId") as string | undefined;
      const name = get(o, "name", "player_name", "playerName") as string | undefined;
      if (!player_id || !name) {
        errors.push("Missing player_id or name");
        continue;
      }
      const getNumIngest = (obj: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) {
        const v = obj[k];
        if (typeof v === "number" && !Number.isNaN(v)) return v;
        if (typeof v === "string") { const n = parseInt(v, 10); if (!Number.isNaN(n)) return n; }
      }
      return 0;
    };
      try {
        const jersey = getNumIngest(o, "jerseyNumber", "jersey_number", "number", "num", "jersey");
        await insertIntoPlayerInfo({
          player_id: String(player_id),
          name: String(name),
          team: get(o, "team", "team_name", "teamName") as string | undefined,
          position: get(o, "position", "pos") as string | undefined,
          height: get(o, "height", "ht") as string | undefined,
          weight: get(o, "weight", "weig", "wt") as string | number | undefined,
          jersey_number: jersey,
        });
        playersInserted++;
      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : String(err));
        continue;
      }
      const statsRaw = o.stats ?? o.seasons ?? [];
      const statsList = Array.isArray(statsRaw) ? statsRaw : [];
      for (const s of statsList) {
        const statObj = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
        try {
          await insertPlayerStatsRow({
            player_id: String(player_id),
            season: get(statObj, "season", "year_id", "year") as string | undefined,
            team: get(statObj, "team", "team_name_abbr", "teamName") as string | undefined,
            league: get(statObj, "league", "comp_name_abbr", "league") as string | undefined,
            games: Number(get(statObj, "games", "gp", "g")) || 0,
            games_started: Number(get(statObj, "games_started", "gs")) || 0,
            pts_per_g: get(statObj, "pts_per_g", "ppg", "pts"),
            trb_per_g: get(statObj, "trb_per_g", "rpg", "reb"),
            ast_per_g: get(statObj, "ast_per_g", "apg", "ast"),
            stl_per_g: get(statObj, "stl_per_g", "spg", "stl"),
            blk_per_g: get(statObj, "blk_per_g", "bpg", "blk"),
            fg_pct: get(statObj, "fg_pct", "fg%"),
            fg3_pct: get(statObj, "fg3_pct", "fg3%"),
            ft_pct: get(statObj, "ft_pct", "ft%"),
          });
          statsInserted++;
        } catch (err: unknown) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    }
    res.json({ playersInserted, statsInserted, errors });
  });

  app.post("/api/featured-players", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!isValidAdminToken(token)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.some((id: any) => typeof id !== "number")) {
      return res.status(400).json({ error: "ids must be an array of numbers" });
    }
    try {
      await storage.setFeaturedPlayerIds(ids);
      res.json({ success: true });
    } catch (e) {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS site_settings (
            "key" TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);
        await pool.query(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS "key" TEXT`);
        await pool.query(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT ''`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS site_settings_key_idx ON site_settings ("key")`);
        await storage.setFeaturedPlayerIds(ids);
        res.json({ success: true });
      } catch (retryErr) {
        console.error("[featured-players] save failed:", retryErr);
        res.status(500).json({ error: "Featured players could not be saved.", details: String((e as Error).message) });
      }
    }
  });

  app.post("/api/players/:id/headshot", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!isValidAdminToken(token)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const id = Number(req.params.id);
    const { objectPath } = req.body;
    if (!objectPath || typeof objectPath !== "string") {
      return res.status(400).json({ error: "Missing objectPath" });
    }
    try {
      await storage.updatePlayerHeadshot(id, objectPath);
    } catch (err) {
      console.error("[headshot] app table update failed:", err);
    }
    try {
      await setExternalHeadshotById(id, objectPath);
    } catch (err) {
      console.error("[headshot] external table update failed:", err);
    }
    res.json({ success: true });
  });

  app.use("/api/uploads", (req, res, next) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!isValidAdminToken(token)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  });

  registerObjectStorageRoutes(app);

  app.patch("/api/players/:id", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!isValidAdminToken(token)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const id = Number(req.params.id);
    const allowedFields = ['name', 'position', 'team', 'height', 'weight', 'jerseyNumber', 'bio', 'hometown', 'birthDate'] as const;
    const data: Record<string, any> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        data[field] = field === 'jerseyNumber' ? Number(req.body[field]) : req.body[field];
      }
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    const updated = await storage.updatePlayer(id, data);
    if (!updated) {
      return res.status(404).json({ error: "Player not found" });
    }
    res.json(updated);
  });

  app.patch("/api/players/:id/profile-views", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!isValidAdminToken(token)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid player id" });
    }
    const profileViews = req.body?.profileViews;
    if (typeof profileViews !== "number" || profileViews < 0) {
      return res.status(400).json({ error: "profileViews must be a non-negative number" });
    }
    try {
      await storage.setPlayerProfileViews(id, profileViews);
    } catch (appErr) {
      console.error("[profile-views] app table update failed:", appErr);
      try {
        await setExternalProfileViewsById(id, profileViews);
        return res.json({ success: true, profileViews: profileViews });
      } catch (extErr) {
        console.error("[profile-views] external table update failed:", extErr);
        return res.status(500).json({ error: "Failed to update profile views" });
      }
    }
    try {
      await setExternalProfileViewsById(id, profileViews);
    } catch {
      // optional: external table may not exist; app table is updated
    }
    res.json({ success: true, profileViews: profileViews });
  });

  // Total player count
  app.get("/api/players/count", async (_req, res) => {
    try {
      let count = await getPlayerInfoCount();
      if (count === 0) count = await storage.getPlayerCount();
      res.json({ count });
    } catch {
      res.json({ count: 0 });
    }
  });

  // Players List — show from "Player info" first; cap at 50 when no search so directory doesn't overload
  const DIRECTORY_LIST_LIMIT = 50;
  app.get(api.players.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const position = req.query.position as string | undefined;
    const sortBy = req.query.sortBy as "views" | "name" | undefined;
    const hasSearch = (search?.trim() ?? "") !== "" || (position && position !== "ALL");

    let players: { id: number; name: string; position: string; team: string; height: string; weight: string; jerseyNumber: number; headshotUrl: string; profileViews: number }[];
    try {
      const fromPlayerInfo = await getPlayerInfoRows();
      if (fromPlayerInfo.length > 0) {
        players = fromPlayerInfo;
        let list = players;
        const searchLower = search?.toLowerCase().trim();
        if (searchLower) list = list.filter((p) => p.name.toLowerCase().includes(searchLower));
        if (position && position !== "ALL") list = list.filter((p) => p.position === position);
        if (sortBy === "views") list = [...list].sort((a, b) => (b.profileViews ?? 0) - (a.profileViews ?? 0));
        else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        if (!hasSearch) list = list.slice(0, DIRECTORY_LIST_LIMIT);
        res.json(list);
        return;
      }
    } catch {
      // fall through to app table
    }

    try {
      players = await storage.getPlayers(search, position, sortBy);
      if (players.length === 0) {
        try {
          await syncPlayerInfoFromPostgres();
          players = await storage.getPlayers(search, position, sortBy);
        } catch {
          // ignore
        }
      }
      if (!hasSearch) players = players.slice(0, DIRECTORY_LIST_LIMIT);
      res.json(players);
      return;
    } catch {
      // app table failed (e.g. schema mismatch); try external again and return whatever we can
      try {
        const fromPlayerInfo = await getPlayerInfoRows();
        let list = fromPlayerInfo;
        const searchLower = search?.toLowerCase().trim();
        if (searchLower) list = list.filter((p) => p.name.toLowerCase().includes(searchLower));
        if (position && position !== "ALL") list = list.filter((p) => p.position === position);
        if (sortBy === "views") list = [...list].sort((a, b) => (b.profileViews ?? 0) - (a.profileViews ?? 0));
        else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        if (!hasSearch) list = list.slice(0, DIRECTORY_LIST_LIMIT);
        res.json(list);
        return;
      } catch {
        res.json([]);
      }
    }
  });

  // Prospects (under 20, top 50 by views) — try external "Player info" first so it works with full dataset
  app.get("/api/players/prospects", async (_req, res) => {
    try {
      const fromExternal = await getProspectsFromExternalTable(20, 50);
      if (fromExternal.length > 0) {
        const list = fromExternal.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          team: p.team,
          height: p.height,
          weight: p.weight,
          jerseyNumber: p.jerseyNumber ?? 0,
          headshotUrl: p.headshotUrl ?? "",
          bio: p.bio ?? null,
          profileViews: p.profileViews ?? 50,
          hometown: p.hometown ?? null,
          birthDate: p.birthDate ?? null,
        }));
        return res.json(list);
      }
    } catch {
      // fall through
    }
    try {
      const results = await storage.getProspects(20, 50);
      return res.json(results);
    } catch {
      return res.json([]);
    }
  });

  // Birth year counts (for year grid) — must be before /api/players/:id or "birth-year-counts" is treated as id
  app.get("/api/players/birth-year-counts", async (_req, res) => {
    try {
      const counts = await getBirthYearCountsFromExternalTable();
      if (Object.keys(counts).length > 0) return res.json(counts);
    } catch {
      // fall through
    }
    const players = await storage.getPlayers();
    const counts: Record<string, number> = {};
    for (const p of players) {
      const bd = p.birthDate ?? (p as { birth_date?: string }).birth_date ?? null;
      if (bd == null || bd === "") continue;
      const d = new Date(String(bd).trim());
      if (Number.isNaN(d.getTime())) continue;
      const year = String(d.getFullYear());
      counts[year] = (counts[year] ?? 0) + 1;
    }
    res.json(counts);
  });

  // Players by birth year — must be before /api/players/:id
  const BIRTH_YEAR_LIMIT = 100;
  app.get("/api/players/birth-year/:year", async (req, res) => {
    const year = parseInt(req.params.year);
    if (isNaN(year)) {
      return res.status(400).json({ message: "Invalid year" });
    }
    try {
      const fromExternal = await getPlayersByBirthYearFromExternalTable(year, BIRTH_YEAR_LIMIT);
      if (fromExternal.length > 0) {
        const list = fromExternal.map((p) => ({
          id: p.id,
          player_id: p.player_id || undefined,
          name: p.name,
          position: p.position,
          team: p.team,
          height: p.height,
          weight: p.weight,
          jerseyNumber: p.jerseyNumber ?? 0,
          headshotUrl: p.headshotUrl ?? "",
          bio: p.bio ?? null,
          profileViews: p.profileViews ?? 50,
          hometown: p.hometown ?? null,
          birthDate: p.birthDate ?? null,
        }));
        return res.json(list);
      }
    } catch {
      // fall through to app table
    }
    const results = await storage.getPlayersByBirthYear(year);
    res.json(results);
  });

  // Player Detail (with stats) — :id can be numeric (player_info table) or player_id string ("Player info")
  app.get(api.players.get.path, async (req, res) => {
    try {
      const idParam = req.params.id;
      const idNum = Number(idParam);

      if (!Number.isNaN(idNum)) {
        let player: Awaited<ReturnType<typeof storage.getPlayer>>;
        try {
          player = await storage.getPlayer(idNum);
        } catch {
          player = undefined;
        }
        if (!player) {
          try {
            const fromPlayerInfo = await getPlayerInfoById(idNum);
            if (fromPlayerInfo) {
              const out = { ...normalizePlayerForApi(fromPlayerInfo as Record<string, unknown>), stats: fromPlayerInfo.stats ?? [], awards: [] };
              const externalViews = await getExternalProfileViewsById(idNum);
              if (externalViews !== null) (out as Record<string, unknown>).profileViews = externalViews;
              try {
                const appPlayer = await storage.getPlayer(idNum);
                if (appPlayer?.headshotUrl && appPlayer.headshotUrl.startsWith("/objects/"))
                  (out as Record<string, unknown>).headshotUrl = appPlayer.headshotUrl;
              } catch { /* ignore */ }
              return res.json(out);
            }
          } catch {
            // ignore
          }
        } else {
          try {
            const [stats, awards] = await Promise.all([
              storage.getPlayerStats(idNum),
              storage.getPlayerAwards(idNum)
            ]);
            const out = normalizePlayerForApi(player as Record<string, unknown>);
            return res.json({ ...out, stats, awards });
          } catch {
            // app table stats/awards failed; return player without them
            const out = normalizePlayerForApi(player as Record<string, unknown>);
            return res.json({ ...out, stats: [], awards: [] });
          }
        }
      }

      try {
        const fromPlayerInfo = await getPlayerInfoByPlayerId(idParam);
        if (fromPlayerInfo) {
          const out = { ...normalizePlayerForApi(fromPlayerInfo as Record<string, unknown>), stats: fromPlayerInfo.stats ?? [], awards: [] };
          const idForViews = Number((fromPlayerInfo as Record<string, unknown>).id);
          if (!Number.isNaN(idForViews)) {
            const externalViews = await getExternalProfileViewsById(idForViews);
            if (externalViews !== null) (out as Record<string, unknown>).profileViews = externalViews;
            try {
              const appPlayer = await storage.getPlayer(idForViews);
              if (appPlayer?.headshotUrl && appPlayer.headshotUrl.startsWith("/objects/"))
                (out as Record<string, unknown>).headshotUrl = appPlayer.headshotUrl;
            } catch { /* ignore */ }
          }
          return res.json(out);
        }
      } catch {
        // ignore
      }
      return res.status(404).json({ message: "Player not found" });
    } catch (err) {
      console.error("GET /api/players/:id error:", err);
      return res.status(404).json({ message: "Player not found" });
    }
  });

  // Increment Player Views
  app.post("/api/players/:id/view", async (req, res) => {
    const idParam = req.params.id ?? "";
    const idNum = Number(idParam);
    if (!Number.isNaN(idNum)) {
      await storage.incrementPlayerViews(idNum);
      try {
        await incrementExternalProfileViewsById(idNum);
      } catch {
        // external table may not exist or have column
      }
    } else {
      await incrementProfileViewsByPlayerId(idParam);
    }
    res.json({ success: true });
  });

  // Team Roster — only players with a season record for this team + season (JOIN player_info + stats table; no current_team)
  app.get("/api/teams/:team/roster/:season", async (req, res) => {
    const teamRaw = req.params.team ?? "";
    const seasonRaw = req.params.season ?? "";
    const team = decodeURIComponent(teamRaw).replace(/\+/g, " ").trim();
    const season = decodeURIComponent(seasonRaw).trim();
    console.log("[roster] received from frontend — team:", JSON.stringify(team), "season:", JSON.stringify(season));

    let roster: { id: number; name: string; position: string; team: string; height: string; weight: string; jerseyNumber: number; headshotUrl: string; bio: string | null; profileViews: number; hometown: string | null; birthDate: string | null; player_id?: string }[] = [];

    try {
      roster = await storage.getRoster(team, season);
    } catch {
      // app tables may be missing or have schema issues
    }

    if (roster.length === 0) {
      try {
        const fromJoin = await getRosterFromExternalTableViaJoin(team, season);
        roster = fromJoin.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          team: p.team,
          height: p.height,
          weight: p.weight,
          jerseyNumber: p.jerseyNumber ?? 0,
          headshotUrl: p.headshotUrl ?? "",
          bio: p.bio ?? null,
          profileViews: p.profileViews ?? 50,
          hometown: p.hometown ?? null,
          birthDate: p.birthDate ?? null,
        }));
      } catch {
        // keep roster []
      }
    }

    if (roster.length === 0) {
      try {
        const fromExternal = await getRosterFromExternalTable(team, season);
        roster = fromExternal.map((p) => ({
          id: p.id,
          player_id: p.player_id || undefined,
          name: p.name,
          position: p.position,
          team: p.team,
          height: p.height,
          weight: p.weight,
          jerseyNumber: p.jerseyNumber ?? 0,
          headshotUrl: p.headshotUrl ?? "",
          bio: p.bio ?? null,
          profileViews: p.profileViews ?? 50,
          hometown: p.hometown ?? null,
          birthDate: p.birthDate ?? null,
        }));
      } catch {
        // keep roster []
      }
    }

    console.log("[roster] number of players returned:", roster.length);
    res.json(roster);
  });

  // Team Record (team_records table may not exist on all deploys)
  app.get("/api/teams/:team/record/:season", async (req, res) => {
    const team = decodeURIComponent(req.params.team ?? "").replace(/\+/g, " ").trim();
    const season = decodeURIComponent(req.params.season ?? "").trim();
    try {
      const record = await storage.getTeamRecord(team, season);
      if (!record) {
        return res.status(404).json({ message: "Record not found" });
      }
      res.json(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("does not exist") || msg.includes("relation")) {
        return res.status(404).json({ message: "Record not found" });
      }
      throw err;
    }
  });

  app.get("/api/teams/count", async (req, res) => {
    const count = await storage.getTotalTeamCount();
    res.json({ count });
  });

  // All teams with league info
  app.get("/api/teams/all", async (req, res) => {
    const dbTeams = await storage.getAllTeamsWithLeague();
    res.json(dbTeams);
  });

  // Teams by League
  app.get("/api/leagues/:league/teams", async (req, res) => {
    const { league } = req.params;
    const teams = await storage.getTeamsByLeague(league);
    res.json(teams);
  });

  // NBA Scraper endpoint
  let scraperRunning = false;
  app.post("/api/scraper/nba", async (req, res) => {
    if (scraperRunning) {
      return res.status(409).json({ message: "Scraper is already running. Please wait." });
    }
    scraperRunning = true;
    try {
      const result = await scrapeNBAPlayers();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: "Scraper failed", error: err.message });
    } finally {
      scraperRunning = false;
    }
  });

  app.get("/api/scraper/status", (req, res) => {
    res.json({ running: scraperRunning, bioRunning: isBioScraperRunning() });
  });

  app.post("/api/scraper/bios", async (req, res) => {
    if (isBioScraperRunning()) {
      return res.status(409).json({ message: "Bio scraper is already running. Please wait." });
    }
    res.json({ message: "Bio scraper started. This will take a while (~30 minutes for 500+ players)." });
    updatePlayerBios().then(result => {
      console.log("[Bio Scraper] Final result:", JSON.stringify(result));
    }).catch(err => {
      console.error("[Bio Scraper] Failed:", err.message);
    });
  });

  // Seed Data function
  // Only attempt to seed the database when a connection string or PG_* vars are present.
  if (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.RAILWAY_POSTGRESQL_URL ||
    process.env.RAILWAY_DATABASE_URL ||
    process.env.PGHOST
  ) {
    try {
      await seedDatabase();
    } catch (err: any) {
      // If the database schema/tables don't exist, log a clear actionable message
      // and continue without crashing the entire process. This prevents an
      // unhandled rejection from bringing the app down during first-time
      // deploys when migrations haven't been run.
      console.error("Database seed failed during startup:", err?.message ?? String(err));
      if (err?.message && /relation .* does not exist/i.test(err.message)) {
        console.error(
          "It looks like your database schema is missing (relation/table not found).\n" +
            "Run the migrations to create the required tables, e.g. `npm run db:push`\n" +
            "or ensure your database has the expected schema before starting the app."
        );
      }
      console.warn("Continuing startup without seeding. Some endpoints may fail until the schema is created.");
    }
  } else {
    console.warn("Database not configured; skipping seedDatabase.");
  }

  return httpServer;
}

async function seedTeamRecords() {
  const existingRecord = await storage.getTeamRecord("Los Angeles Lakers", "2023-24");
  if (existingRecord) return;

  console.log("Seeding team records...");

  // Los Angeles Lakers
  await storage.createTeamRecord({ team: "Los Angeles Lakers", season: "2023-24", wins: 47, losses: 35 });
  await storage.createTeamRecord({ team: "Los Angeles Lakers", season: "2022-23", wins: 43, losses: 39 });
  await storage.createTeamRecord({ team: "Los Angeles Lakers", season: "2021-22", wins: 33, losses: 49 });
  await storage.createTeamRecord({ team: "Los Angeles Lakers", season: "2020-21", wins: 42, losses: 30 });

  // Golden State Warriors
  await storage.createTeamRecord({ team: "Golden State Warriors", season: "2023-24", wins: 46, losses: 36 });
  await storage.createTeamRecord({ team: "Golden State Warriors", season: "2022-23", wins: 44, losses: 38 });
  await storage.createTeamRecord({ team: "Golden State Warriors", season: "2021-22", wins: 53, losses: 29 });
  await storage.createTeamRecord({ team: "Golden State Warriors", season: "2020-21", wins: 39, losses: 33 });
  await storage.createTeamRecord({ team: "Golden State Warriors", season: "2018-19", wins: 57, losses: 25 });

  // Denver Nuggets
  await storage.createTeamRecord({ team: "Denver Nuggets", season: "2023-24", wins: 57, losses: 25 });
  await storage.createTeamRecord({ team: "Denver Nuggets", season: "2022-23", wins: 53, losses: 29 });
  await storage.createTeamRecord({ team: "Denver Nuggets", season: "2021-22", wins: 48, losses: 34 });
  await storage.createTeamRecord({ team: "Denver Nuggets", season: "2020-21", wins: 47, losses: 25 });

  // Phoenix Suns
  await storage.createTeamRecord({ team: "Phoenix Suns", season: "2023-24", wins: 49, losses: 33 });
  await storage.createTeamRecord({ team: "Phoenix Suns", season: "2022-23", wins: 45, losses: 37 });

  // Brooklyn Nets
  await storage.createTeamRecord({ team: "Brooklyn Nets", season: "2021-22", wins: 44, losses: 38 });
  await storage.createTeamRecord({ team: "Brooklyn Nets", season: "2020-21", wins: 48, losses: 24 });

  // Chicago Bulls
  await storage.createTeamRecord({ team: "Chicago Bulls", season: "1997-98", wins: 62, losses: 20 });
  await storage.createTeamRecord({ team: "Chicago Bulls", season: "1995-96", wins: 72, losses: 10 });
  await storage.createTeamRecord({ team: "Chicago Bulls", season: "1992-93", wins: 57, losses: 25 });
  await storage.createTeamRecord({ team: "Chicago Bulls", season: "1987-88", wins: 50, losses: 32 });

  // Dallas Mavericks
  await storage.createTeamRecord({ team: "Dallas Mavericks", season: "2025-26", wins: 33, losses: 19 });

  // G League Teams
  await storage.createTeamRecord({ team: "South Bay Lakers", season: "2023-24", wins: 20, losses: 14, league: "G League" });
  await storage.createTeamRecord({ team: "South Bay Lakers", season: "2021-22", wins: 17, losses: 15, league: "G League" });
  await storage.createTeamRecord({ team: "South Bay Lakers", season: "2020-21", wins: 8, losses: 7, league: "G League" });
  await storage.createTeamRecord({ team: "Delaware Blue Coats", season: "2022-23", wins: 18, losses: 14, league: "G League" });
  await storage.createTeamRecord({ team: "Santa Cruz Warriors", season: "2023-24", wins: 22, losses: 12, league: "G League" });
  await storage.createTeamRecord({ team: "Santa Cruz Warriors", season: "2022-23", wins: 19, losses: 13, league: "G League" });
  await storage.createTeamRecord({ team: "Santa Cruz Warriors", season: "2021-22", wins: 16, losses: 16, league: "G League" });
  await storage.createTeamRecord({ team: "Santa Cruz Warriors", season: "2020-21", wins: 8, losses: 7, league: "G League" });
  await storage.createTeamRecord({ team: "Windy City Bulls", season: "2023-24", wins: 15, losses: 19, league: "G League" });
  await storage.createTeamRecord({ team: "Windy City Bulls", season: "2022-23", wins: 14, losses: 18, league: "G League" });
  await storage.createTeamRecord({ team: "Stockton Kings", season: "2021-22", wins: 18, losses: 14, league: "G League" });
  await storage.createTeamRecord({ team: "Agua Caliente Clippers", season: "2020-21", wins: 7, losses: 8, league: "G League" });
  await storage.createTeamRecord({ team: "Maine Celtics", season: "2023-24", wins: 21, losses: 13, league: "G League" });
  await storage.createTeamRecord({ team: "Maine Celtics", season: "2022-23", wins: 20, losses: 12, league: "G League" });
  await storage.createTeamRecord({ team: "College Park Skyhawks", season: "2021-22", wins: 12, losses: 20, league: "G League" });
  await storage.createTeamRecord({ team: "Fort Wayne Mad Ants", season: "2020-21", wins: 9, losses: 6, league: "G League" });
}

async function seedDatabase() {
  const existing = await storage.getPlayers();
  if (existing.length > 0) {
    await seedTeamRecords();
    return;
  }

  console.log("Seeding database with legendary players...");

  // 1. LeBron James
  const lebron = await storage.createPlayer({
    name: "LeBron James",
    position: "SF",
    team: "Los Angeles Lakers",
    height: "6'9\"",
    weight: "250 lbs",
    jerseyNumber: 23,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png",
    bio: "LeBron Raymone James Sr. is an American professional basketball player for the Los Angeles Lakers. widely considered one of the greatest players in NBA history.",
    hometown: "Akron, OH",
    birthDate: "1984-12-30",
  });

  await storage.createPlayerStats({ playerId: lebron.id, season: "2023-24", team: "Los Angeles Lakers", gamesPlayed: 71, pointsPerGame: "25.7", reboundsPerGame: "7.3", assistsPerGame: "8.3", stealsPerGame: "1.3", blocksPerGame: "0.5", fieldGoalPct: "54.0" });
  await storage.createPlayerStats({ playerId: lebron.id, season: "2022-23", team: "Los Angeles Lakers", gamesPlayed: 55, pointsPerGame: "28.9", reboundsPerGame: "8.3", assistsPerGame: "6.8", stealsPerGame: "0.9", blocksPerGame: "0.6", fieldGoalPct: "50.0" });
  await storage.createPlayerStats({ playerId: lebron.id, season: "2021-22", team: "Los Angeles Lakers", gamesPlayed: 56, pointsPerGame: "30.3", reboundsPerGame: "8.2", assistsPerGame: "6.2", stealsPerGame: "1.3", blocksPerGame: "1.1", fieldGoalPct: "52.4" });
  await storage.createPlayerStats({ playerId: lebron.id, season: "2020-21", team: "Los Angeles Lakers", gamesPlayed: 45, pointsPerGame: "25.0", reboundsPerGame: "7.7", assistsPerGame: "7.8", stealsPerGame: "1.1", blocksPerGame: "0.6", fieldGoalPct: "51.3" });

  // 2. Stephen Curry
  const curry = await storage.createPlayer({
    name: "Stephen Curry",
    position: "PG",
    team: "Golden State Warriors",
    height: "6'2\"",
    weight: "185 lbs",
    jerseyNumber: 30,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/201939.png",
    bio: "Wardell Stephen Curry II is an American professional basketball player for the Golden State Warriors. Widely regarded as the greatest shooter of all time.",
    hometown: "Akron, OH",
    birthDate: "1988-03-14",
  });

  await storage.createPlayerStats({ playerId: curry.id, season: "2023-24", team: "Golden State Warriors", gamesPlayed: 74, pointsPerGame: "26.4", reboundsPerGame: "4.5", assistsPerGame: "5.1", stealsPerGame: "0.7", blocksPerGame: "0.4", fieldGoalPct: "45.0" });
  await storage.createPlayerStats({ playerId: curry.id, season: "2022-23", team: "Golden State Warriors", gamesPlayed: 56, pointsPerGame: "29.4", reboundsPerGame: "6.1", assistsPerGame: "6.3", stealsPerGame: "0.9", blocksPerGame: "0.4", fieldGoalPct: "49.3" });
  await storage.createPlayerStats({ playerId: curry.id, season: "2021-22", team: "Golden State Warriors", gamesPlayed: 64, pointsPerGame: "25.5", reboundsPerGame: "5.2", assistsPerGame: "6.3", stealsPerGame: "1.3", blocksPerGame: "0.3", fieldGoalPct: "43.7" });
  await storage.createPlayerStats({ playerId: curry.id, season: "2020-21", team: "Golden State Warriors", gamesPlayed: 63, pointsPerGame: "32.0", reboundsPerGame: "5.5", assistsPerGame: "5.8", stealsPerGame: "1.2", blocksPerGame: "0.1", fieldGoalPct: "48.2" });

  // 3. Klay Thompson
  const klay = await storage.createPlayer({
    name: "Klay Thompson",
    position: "SG",
    team: "Golden State Warriors",
    height: "6'6\"",
    weight: "215 lbs",
    jerseyNumber: 11,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/202691.png",
    bio: "Klay Alexander Thompson is an American professional basketball player for the Golden State Warriors. He is a four-time NBA champion.",
    hometown: "Los Angeles, CA",
    birthDate: "1990-02-08",
  });

  await storage.createPlayerStats({ playerId: klay.id, season: "2023-24", team: "Golden State Warriors", gamesPlayed: 77, pointsPerGame: "17.9", reboundsPerGame: "3.3", assistsPerGame: "2.3", stealsPerGame: "0.6", blocksPerGame: "0.5", fieldGoalPct: "43.2" });
  await storage.createPlayerStats({ playerId: klay.id, season: "2022-23", team: "Golden State Warriors", gamesPlayed: 69, pointsPerGame: "21.9", reboundsPerGame: "4.1", assistsPerGame: "2.4", stealsPerGame: "0.7", blocksPerGame: "0.4", fieldGoalPct: "43.6" });
  await storage.createPlayerStats({ playerId: klay.id, season: "2021-22", team: "Golden State Warriors", gamesPlayed: 32, pointsPerGame: "20.4", reboundsPerGame: "3.9", assistsPerGame: "2.8", stealsPerGame: "0.5", blocksPerGame: "0.5", fieldGoalPct: "42.9" });
  await storage.createPlayerStats({ playerId: klay.id, season: "2020-21", team: "Golden State Warriors", gamesPlayed: 0, pointsPerGame: "0.0", reboundsPerGame: "0.0", assistsPerGame: "0.0", stealsPerGame: "0.0", blocksPerGame: "0.0", fieldGoalPct: "0.0" });
  await storage.createPlayerStats({ playerId: klay.id, season: "2018-19", team: "Golden State Warriors", gamesPlayed: 78, pointsPerGame: "21.5", reboundsPerGame: "3.8", assistsPerGame: "2.4", stealsPerGame: "1.1", blocksPerGame: "0.6", fieldGoalPct: "46.7" });

  // 4. Nikola Jokic
  const jokic = await storage.createPlayer({
    name: "Nikola Jokić",
    position: "C",
    team: "Denver Nuggets",
    height: "6'11\"",
    weight: "284 lbs",
    jerseyNumber: 15,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/203999.png",
    bio: "Nikola Jokić is a Serbian professional basketball player for the Denver Nuggets. He is a multi-time NBA MVP and NBA Champion.",
    hometown: "Sombor, Serbia",
    birthDate: "1995-02-19",
  });

  await storage.createPlayerStats({ playerId: jokic.id, season: "2023-24", team: "Denver Nuggets", gamesPlayed: 79, pointsPerGame: "26.4", reboundsPerGame: "12.4", assistsPerGame: "9.0", stealsPerGame: "1.4", blocksPerGame: "0.9", fieldGoalPct: "58.3" });
  await storage.createPlayerStats({ playerId: jokic.id, season: "2022-23", team: "Denver Nuggets", gamesPlayed: 69, pointsPerGame: "24.5", reboundsPerGame: "11.8", assistsPerGame: "9.8", stealsPerGame: "1.3", blocksPerGame: "0.7", fieldGoalPct: "63.2" });
  await storage.createPlayerStats({ playerId: jokic.id, season: "2021-22", team: "Denver Nuggets", gamesPlayed: 74, pointsPerGame: "27.1", reboundsPerGame: "13.8", assistsPerGame: "7.9", stealsPerGame: "1.5", blocksPerGame: "0.9", fieldGoalPct: "58.3" });
  await storage.createPlayerStats({ playerId: jokic.id, season: "2020-21", team: "Denver Nuggets", gamesPlayed: 72, pointsPerGame: "26.4", reboundsPerGame: "10.8", assistsPerGame: "8.3", stealsPerGame: "1.3", blocksPerGame: "0.7", fieldGoalPct: "56.6" });

  // 5. Kevin Durant
  const kd = await storage.createPlayer({
    name: "Kevin Durant",
    position: "PF",
    team: "Phoenix Suns",
    height: "6'11\"",
    weight: "240 lbs",
    jerseyNumber: 35,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/201142.png",
    bio: "Kevin Wayne Durant is an American professional basketball player for the Phoenix Suns. He is a two-time NBA champion and MVP.",
    hometown: "Washington, D.C.",
    birthDate: "1988-09-29",
  });

  await storage.createPlayerStats({ playerId: kd.id, season: "2023-24", team: "Phoenix Suns", gamesPlayed: 75, pointsPerGame: "27.1", reboundsPerGame: "6.6", assistsPerGame: "5.0", stealsPerGame: "0.9", blocksPerGame: "1.2", fieldGoalPct: "52.3" });
  await storage.createPlayerStats({ playerId: kd.id, season: "2022-23", team: "Phoenix Suns", gamesPlayed: 47, pointsPerGame: "29.1", reboundsPerGame: "6.7", assistsPerGame: "5.0", stealsPerGame: "0.7", blocksPerGame: "1.4", fieldGoalPct: "56.0" });
  await storage.createPlayerStats({ playerId: kd.id, season: "2021-22", team: "Brooklyn Nets", gamesPlayed: 55, pointsPerGame: "29.9", reboundsPerGame: "7.4", assistsPerGame: "6.4", stealsPerGame: "0.9", blocksPerGame: "0.9", fieldGoalPct: "51.8" });
  await storage.createPlayerStats({ playerId: kd.id, season: "2020-21", team: "Brooklyn Nets", gamesPlayed: 35, pointsPerGame: "26.9", reboundsPerGame: "7.1", assistsPerGame: "5.6", stealsPerGame: "0.7", blocksPerGame: "1.3", fieldGoalPct: "53.7" });

  // 6. Michael Jordan (Historical)
  const mj = await storage.createPlayer({
    name: "Michael Jordan",
    position: "SG",
    team: "Chicago Bulls",
    height: "6'6\"",
    weight: "216 lbs",
    jerseyNumber: 23,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/893.png",
    bio: "Michael Jeffrey Jordan is an American businessman and former professional basketball player. He is widely considered the greatest basketball player of all time.",
    hometown: "Brooklyn, NY",
    birthDate: "1963-02-17",
  });

  await storage.createPlayerStats({ playerId: mj.id, season: "1997-98", team: "Chicago Bulls", gamesPlayed: 82, pointsPerGame: "28.7", reboundsPerGame: "5.8", assistsPerGame: "3.5", stealsPerGame: "1.7", blocksPerGame: "0.5", fieldGoalPct: "46.5" });
  await storage.createPlayerStats({ playerId: mj.id, season: "1995-96", team: "Chicago Bulls", gamesPlayed: 82, pointsPerGame: "30.4", reboundsPerGame: "6.6", assistsPerGame: "4.3", stealsPerGame: "2.2", blocksPerGame: "0.5", fieldGoalPct: "49.5" });
  await storage.createPlayerStats({ playerId: mj.id, season: "1992-93", team: "Chicago Bulls", gamesPlayed: 78, pointsPerGame: "32.6", reboundsPerGame: "6.7", assistsPerGame: "5.5", stealsPerGame: "2.8", blocksPerGame: "0.8", fieldGoalPct: "49.5" });
  await storage.createPlayerStats({ playerId: mj.id, season: "1987-88", team: "Chicago Bulls", gamesPlayed: 82, pointsPerGame: "35.0", reboundsPerGame: "5.5", assistsPerGame: "5.9", stealsPerGame: "3.2", blocksPerGame: "1.6", fieldGoalPct: "53.5" });

  // 2020-21 Warriors Roster Additions
  const wiggins = await storage.createPlayer({
    name: "Andrew Wiggins",
    position: "SF",
    team: "Golden State Warriors",
    height: "6'7\"",
    weight: "197 lbs",
    jerseyNumber: 22,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/203952.png",
    bio: "Andrew Wiggins is a Canadian professional basketball player for the Golden State Warriors. He was the first overall pick in the 2014 NBA draft.",
    hometown: "Toronto, Canada",
    birthDate: "1995-02-23",
  });
  await storage.createPlayerStats({ playerId: wiggins.id, season: "2020-21", team: "Golden State Warriors", gamesPlayed: 71, pointsPerGame: "18.6", reboundsPerGame: "4.9", assistsPerGame: "2.4", stealsPerGame: "0.9", blocksPerGame: "1.0", fieldGoalPct: "47.7" });

  const draymond = await storage.createPlayer({
    name: "Draymond Green",
    position: "PF",
    team: "Golden State Warriors",
    height: "6'6\"",
    weight: "230 lbs",
    jerseyNumber: 23,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/203110.png",
    bio: "Draymond Green is an American professional basketball player for the Golden State Warriors. He is a multi-time NBA champion and Defensive Player of the Year.",
    hometown: "Saginaw, MI",
    birthDate: "1990-03-04",
  });
  await storage.createPlayerStats({ playerId: draymond.id, season: "2020-21", team: "Golden State Warriors", gamesPlayed: 63, pointsPerGame: "7.0", reboundsPerGame: "7.1", assistsPerGame: "8.9", stealsPerGame: "1.7", blocksPerGame: "0.8", fieldGoalPct: "44.7" });

  const looney = await storage.createPlayer({
    name: "Kevon Looney",
    position: "C",
    team: "Golden State Warriors",
    height: "6'9\"",
    weight: "222 lbs",
    jerseyNumber: 5,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1626172.png",
    bio: "Kevon Looney is an American professional basketball player for the Golden State Warriors. He has won multiple NBA championships with the team.",
    hometown: "Milwaukee, WI",
    birthDate: "1996-02-06",
  });
  await storage.createPlayerStats({ playerId: looney.id, season: "2020-21", team: "Golden State Warriors", gamesPlayed: 61, pointsPerGame: "4.1", reboundsPerGame: "5.3", assistsPerGame: "2.0", stealsPerGame: "0.3", blocksPerGame: "0.4", fieldGoalPct: "54.8" });

  const poole = await storage.createPlayer({
    name: "Jordan Poole",
    position: "SG",
    team: "Golden State Warriors",
    height: "6'4\"",
    weight: "194 lbs",
    jerseyNumber: 3,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1629673.png",
    bio: "Jordan Poole is an American professional basketball player. He was a key contributor to the Warriors' 2022 championship run.",
    hometown: "Milwaukee, WI",
    birthDate: "1999-06-19",
  });
  await storage.createPlayerStats({ playerId: poole.id, season: "2020-21", team: "Golden State Warriors", gamesPlayed: 51, pointsPerGame: "12.0", reboundsPerGame: "1.8", assistsPerGame: "1.9", stealsPerGame: "0.5", blocksPerGame: "0.2", fieldGoalPct: "43.2" });

  const wiseman = await storage.createPlayer({
    name: "James Wiseman",
    position: "C",
    team: "Golden State Warriors",
    height: "7'0\"",
    weight: "240 lbs",
    jerseyNumber: 33,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1630164.png",
    bio: "James Wiseman is an American professional basketball player. He was selected second overall by the Warriors in the 2020 NBA draft.",
    hometown: "Nashville, TN",
    birthDate: "2001-03-31",
  });
  await storage.createPlayerStats({ playerId: wiseman.id, season: "2020-21", team: "Golden State Warriors", gamesPlayed: 39, pointsPerGame: "11.5", reboundsPerGame: "5.8", assistsPerGame: "0.7", stealsPerGame: "0.3", blocksPerGame: "0.9", fieldGoalPct: "51.9" });

  const damionLee = await storage.createPlayer({
    name: "Damion Lee",
    position: "SG",
    team: "Golden State Warriors",
    height: "6'5\"",
    weight: "203 lbs",
    jerseyNumber: 1,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1627814.png",
    bio: "Damion Lee is an American professional basketball player who won an NBA Championship with the Golden State Warriors in 2022. He is the brother-in-law of Stephen Curry.",
    hometown: "Baltimore, MD",
    birthDate: "1992-10-21",
  });
  await storage.createPlayerStats({ playerId: damionLee.id, season: "2021-22", team: "Golden State Warriors", gamesPlayed: 63, pointsPerGame: "7.4", reboundsPerGame: "3.2", assistsPerGame: "1.0", stealsPerGame: "0.6", blocksPerGame: "0.3", fieldGoalPct: "43.5" });

  // === G League Players (Santa Cruz Warriors) ===
  const scw1 = await storage.createPlayer({
    name: "Mac McClung",
    position: "PG",
    team: "South Bay Lakers",
    height: "6'2\"",
    weight: "185 lbs",
    jerseyNumber: 0,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1630644.png",
    bio: "Mac McClung is an American professional basketball player known for winning back-to-back NBA Slam Dunk Contests. He has played in the G League for multiple teams.",
    hometown: "Gate City, VA",
    birthDate: "1999-01-06",
  });
  await storage.createPlayerStats({ playerId: scw1.id, season: "2023-24", team: "South Bay Lakers", league: "G League", gamesPlayed: 30, pointsPerGame: "22.1", reboundsPerGame: "5.2", assistsPerGame: "5.0", stealsPerGame: "1.5", blocksPerGame: "0.3", fieldGoalPct: "46.8" });
  await storage.createPlayerStats({ playerId: scw1.id, season: "2022-23", team: "Delaware Blue Coats", league: "G League", gamesPlayed: 34, pointsPerGame: "21.6", reboundsPerGame: "4.8", assistsPerGame: "7.6", stealsPerGame: "1.8", blocksPerGame: "0.2", fieldGoalPct: "44.2" });
  await storage.createPlayerStats({ playerId: scw1.id, season: "2021-22", team: "South Bay Lakers", league: "G League", gamesPlayed: 28, pointsPerGame: "19.4", reboundsPerGame: "4.1", assistsPerGame: "6.2", stealsPerGame: "1.4", blocksPerGame: "0.1", fieldGoalPct: "43.5" });
  await storage.createPlayerStats({ playerId: scw1.id, season: "2020-21", team: "South Bay Lakers", league: "G League", gamesPlayed: 15, pointsPerGame: "16.8", reboundsPerGame: "3.3", assistsPerGame: "4.5", stealsPerGame: "1.2", blocksPerGame: "0.2", fieldGoalPct: "42.1" });

  const scw2 = await storage.createPlayer({
    name: "Quinndary Weatherspoon",
    position: "SG",
    team: "Santa Cruz Warriors",
    height: "6'3\"",
    weight: "205 lbs",
    jerseyNumber: 15,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1629683.png",
    bio: "Quinndary Weatherspoon is an American professional basketball player for the Santa Cruz Warriors, the G League affiliate of the Golden State Warriors.",
    hometown: "Canton, MS",
    birthDate: "1996-09-10",
  });
  await storage.createPlayerStats({ playerId: scw2.id, season: "2023-24", team: "Santa Cruz Warriors", league: "G League", gamesPlayed: 36, pointsPerGame: "18.4", reboundsPerGame: "5.1", assistsPerGame: "3.8", stealsPerGame: "1.6", blocksPerGame: "0.4", fieldGoalPct: "47.2" });
  await storage.createPlayerStats({ playerId: scw2.id, season: "2022-23", team: "Santa Cruz Warriors", league: "G League", gamesPlayed: 40, pointsPerGame: "16.2", reboundsPerGame: "4.6", assistsPerGame: "3.2", stealsPerGame: "1.3", blocksPerGame: "0.3", fieldGoalPct: "45.1" });
  await storage.createPlayerStats({ playerId: scw2.id, season: "2021-22", team: "Santa Cruz Warriors", league: "G League", gamesPlayed: 32, pointsPerGame: "14.8", reboundsPerGame: "4.3", assistsPerGame: "2.9", stealsPerGame: "1.1", blocksPerGame: "0.2", fieldGoalPct: "44.6" });
  await storage.createPlayerStats({ playerId: scw2.id, season: "2020-21", team: "Santa Cruz Warriors", league: "G League", gamesPlayed: 15, pointsPerGame: "12.5", reboundsPerGame: "3.8", assistsPerGame: "2.1", stealsPerGame: "0.9", blocksPerGame: "0.1", fieldGoalPct: "43.0" });

  const scw3 = await storage.createPlayer({
    name: "Lester Quinones",
    position: "SG",
    team: "Santa Cruz Warriors",
    height: "6'5\"",
    weight: "208 lbs",
    jerseyNumber: 25,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1631244.png",
    bio: "Lester Quinones is an American professional basketball player for the Santa Cruz Warriors. He played college basketball at Memphis.",
    hometown: "Houston, TX",
    birthDate: "2000-08-18",
  });
  await storage.createPlayerStats({ playerId: scw3.id, season: "2023-24", team: "Santa Cruz Warriors", league: "G League", gamesPlayed: 38, pointsPerGame: "15.3", reboundsPerGame: "4.2", assistsPerGame: "2.1", stealsPerGame: "0.8", blocksPerGame: "0.3", fieldGoalPct: "44.5" });
  await storage.createPlayerStats({ playerId: scw3.id, season: "2022-23", team: "Santa Cruz Warriors", league: "G League", gamesPlayed: 42, pointsPerGame: "13.1", reboundsPerGame: "3.9", assistsPerGame: "1.8", stealsPerGame: "0.7", blocksPerGame: "0.2", fieldGoalPct: "42.8" });
  await storage.createPlayerStats({ playerId: scw3.id, season: "2021-22", team: "Santa Cruz Warriors", league: "G League", gamesPlayed: 20, pointsPerGame: "10.2", reboundsPerGame: "3.0", assistsPerGame: "1.4", stealsPerGame: "0.5", blocksPerGame: "0.1", fieldGoalPct: "40.3" });
  await storage.createPlayerStats({ playerId: scw3.id, season: "2020-21", team: "Santa Cruz Warriors", league: "G League", gamesPlayed: 15, pointsPerGame: "8.7", reboundsPerGame: "2.5", assistsPerGame: "1.0", stealsPerGame: "0.4", blocksPerGame: "0.1", fieldGoalPct: "38.9" });

  const scw4 = await storage.createPlayer({
    name: "Jerome Robinson",
    position: "SG",
    team: "Windy City Bulls",
    height: "6'5\"",
    weight: "190 lbs",
    jerseyNumber: 10,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1628973.png",
    bio: "Jerome Robinson is an American professional basketball player. He was the 13th overall pick in the 2018 NBA Draft by the LA Clippers.",
    hometown: "Raleigh, NC",
    birthDate: "1997-02-03",
  });
  await storage.createPlayerStats({ playerId: scw4.id, season: "2023-24", team: "Windy City Bulls", league: "G League", gamesPlayed: 35, pointsPerGame: "20.5", reboundsPerGame: "4.0", assistsPerGame: "4.3", stealsPerGame: "1.2", blocksPerGame: "0.3", fieldGoalPct: "45.6" });
  await storage.createPlayerStats({ playerId: scw4.id, season: "2022-23", team: "Windy City Bulls", league: "G League", gamesPlayed: 38, pointsPerGame: "18.9", reboundsPerGame: "3.7", assistsPerGame: "3.8", stealsPerGame: "1.0", blocksPerGame: "0.2", fieldGoalPct: "44.1" });
  await storage.createPlayerStats({ playerId: scw4.id, season: "2021-22", team: "Stockton Kings", league: "G League", gamesPlayed: 30, pointsPerGame: "17.2", reboundsPerGame: "3.5", assistsPerGame: "3.4", stealsPerGame: "0.9", blocksPerGame: "0.2", fieldGoalPct: "43.5" });
  await storage.createPlayerStats({ playerId: scw4.id, season: "2020-21", team: "Agua Caliente Clippers", league: "G League", gamesPlayed: 15, pointsPerGame: "14.6", reboundsPerGame: "3.1", assistsPerGame: "2.8", stealsPerGame: "0.7", blocksPerGame: "0.1", fieldGoalPct: "41.2" });

  const scw5 = await storage.createPlayer({
    name: "Jalen Lecque",
    position: "PG",
    team: "Maine Celtics",
    height: "6'4\"",
    weight: "190 lbs",
    jerseyNumber: 2,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1629665.png",
    bio: "Jalen Lecque is an American professional basketball player in the G League. Known for his explosive athleticism and dunking ability.",
    hometown: "Bronx, NY",
    birthDate: "2000-06-13",
  });
  await storage.createPlayerStats({ playerId: scw5.id, season: "2023-24", team: "Maine Celtics", league: "G League", gamesPlayed: 32, pointsPerGame: "16.8", reboundsPerGame: "4.5", assistsPerGame: "5.2", stealsPerGame: "1.4", blocksPerGame: "0.5", fieldGoalPct: "43.2" });
  await storage.createPlayerStats({ playerId: scw5.id, season: "2022-23", team: "Maine Celtics", league: "G League", gamesPlayed: 36, pointsPerGame: "14.5", reboundsPerGame: "3.9", assistsPerGame: "4.8", stealsPerGame: "1.2", blocksPerGame: "0.4", fieldGoalPct: "41.8" });
  await storage.createPlayerStats({ playerId: scw5.id, season: "2021-22", team: "College Park Skyhawks", league: "G League", gamesPlayed: 28, pointsPerGame: "12.1", reboundsPerGame: "3.2", assistsPerGame: "3.9", stealsPerGame: "1.0", blocksPerGame: "0.3", fieldGoalPct: "40.5" });
  await storage.createPlayerStats({ playerId: scw5.id, season: "2020-21", team: "Fort Wayne Mad Ants", league: "G League", gamesPlayed: 15, pointsPerGame: "9.8", reboundsPerGame: "2.7", assistsPerGame: "3.1", stealsPerGame: "0.8", blocksPerGame: "0.2", fieldGoalPct: "38.7" });

  // Victor Wembanyama
  const wemby = await storage.createPlayer({
    name: "Victor Wembanyama",
    position: "C",
    team: "San Antonio Spurs",
    height: "7'4\"",
    weight: "210 lbs",
    jerseyNumber: 1,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1641705.png",
    bio: "Victor Wembanyama is a French professional basketball player for the San Antonio Spurs. The #1 overall pick in the 2023 NBA Draft, he won unanimous Rookie of the Year and became the first rookie ever named to the All-Defensive First Team.",
    hometown: "Le Chesnay, France",
    birthDate: "2004-01-04",
  });
  await storage.createPlayerStats({ playerId: wemby.id, season: "2025-26", team: "San Antonio Spurs", gamesPlayed: 40, pointsPerGame: "24.0", reboundsPerGame: "11.1", assistsPerGame: "2.8", stealsPerGame: "1.0", blocksPerGame: "2.7", fieldGoalPct: "50.8" });
  await storage.createPlayerStats({ playerId: wemby.id, season: "2024-25", team: "San Antonio Spurs", gamesPlayed: 46, pointsPerGame: "24.3", reboundsPerGame: "11.0", assistsPerGame: "2.8", stealsPerGame: "1.0", blocksPerGame: "3.8", fieldGoalPct: "47.8" });
  await storage.createPlayerStats({ playerId: wemby.id, season: "2023-24", team: "San Antonio Spurs", gamesPlayed: 71, pointsPerGame: "21.4", reboundsPerGame: "10.6", assistsPerGame: "3.9", stealsPerGame: "1.2", blocksPerGame: "3.6", fieldGoalPct: "46.5" });
  await storage.createPlayerStats({ playerId: wemby.id, season: "2022-23", team: "Metropolitans 92", league: "EuroLeague", gamesPlayed: 33, pointsPerGame: "21.6", reboundsPerGame: "10.4", assistsPerGame: "2.4", stealsPerGame: "1.2", blocksPerGame: "3.0", fieldGoalPct: "54.4" });

  // Mike James (International)
  const mikeJames = await storage.createPlayer({
    name: "Mike James",
    position: "PG",
    team: "AS Monaco",
    height: "6'1\"",
    weight: "185 lbs",
    jerseyNumber: 55,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1631244.png",
    bio: "Mike James is an American professional basketball player for AS Monaco in the EuroLeague. He is the EuroLeague all-time leading scorer and was named the 2023-24 EuroLeague MVP. Known for his elite scoring and playmaking, James has led Monaco to multiple Final Four appearances.",
    hometown: "Portland, OR",
    birthDate: "1990-08-18",
  });
  await storage.createPlayerStats({ playerId: mikeJames.id, season: "2025-26", team: "AS Monaco", league: "EuroLeague", gamesPlayed: 27, pointsPerGame: "17.2", reboundsPerGame: "3.2", assistsPerGame: "6.6", stealsPerGame: "1.0", blocksPerGame: "0.1", fieldGoalPct: "46.8" });
  await storage.createPlayerStats({ playerId: mikeJames.id, season: "2024-25", team: "AS Monaco", league: "EuroLeague", gamesPlayed: 41, pointsPerGame: "18.4", reboundsPerGame: "3.5", assistsPerGame: "5.3", stealsPerGame: "1.1", blocksPerGame: "0.1", fieldGoalPct: "46.3" });
  await storage.createPlayerStats({ playerId: mikeJames.id, season: "2023-24", team: "AS Monaco", league: "EuroLeague", gamesPlayed: 39, pointsPerGame: "17.9", reboundsPerGame: "4.9", assistsPerGame: "5.1", stealsPerGame: "1.0", blocksPerGame: "0.1", fieldGoalPct: "45.8" });
  await storage.createPlayerStats({ playerId: mikeJames.id, season: "2022-23", team: "AS Monaco", league: "EuroLeague", gamesPlayed: 38, pointsPerGame: "15.9", reboundsPerGame: "3.4", assistsPerGame: "5.3", stealsPerGame: "0.9", blocksPerGame: "0.1", fieldGoalPct: "44.9" });
  await storage.createPlayerStats({ playerId: mikeJames.id, season: "2021-22", team: "AS Monaco", league: "EuroLeague", gamesPlayed: 38, pointsPerGame: "16.4", reboundsPerGame: "3.2", assistsPerGame: "4.9", stealsPerGame: "1.0", blocksPerGame: "0.1", fieldGoalPct: "45.6" });

  // Cooper Flagg
  const flagg = await storage.createPlayer({
    name: "Cooper Flagg",
    position: "SF",
    team: "Dallas Mavericks",
    height: "6'9\"",
    weight: "205 lbs",
    jerseyNumber: 2,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1642843.png",
    bio: "Cooper Flagg is an American professional basketball player for the Dallas Mavericks. The #1 overall pick in the 2025 NBA Draft out of Duke University, Flagg was the consensus National Player of the Year as a freshman. Known for his elite two-way versatility, scoring ability, and basketball IQ.",
    hometown: "Newport, ME",
    birthDate: "2006-12-21",
  });
  await storage.createPlayerStats({ playerId: flagg.id, season: "2025-26", team: "Dallas Mavericks", gamesPlayed: 52, pointsPerGame: "20.4", reboundsPerGame: "6.6", assistsPerGame: "4.2", stealsPerGame: "1.4", blocksPerGame: "1.4", fieldGoalPct: "48.5" });
  await storage.createPlayerStats({ playerId: flagg.id, season: "2024-25", team: "Duke Blue Devils", league: "NCAA", gamesPlayed: 37, pointsPerGame: "19.2", reboundsPerGame: "7.5", assistsPerGame: "4.2", stealsPerGame: "1.4", blocksPerGame: "1.4", fieldGoalPct: "48.0" });
  await storage.createPlayerStats({ playerId: flagg.id, season: "2023-24", team: "Montverde Academy", league: "HS", gamesPlayed: 32, pointsPerGame: "16.5", reboundsPerGame: "7.2", assistsPerGame: "3.8", stealsPerGame: "1.8", blocksPerGame: "2.1", fieldGoalPct: "52.0" });
  await storage.createPlayerStats({ playerId: flagg.id, season: "2022-23", team: "Nokomis Regional", league: "HS", gamesPlayed: 28, pointsPerGame: "20.5", reboundsPerGame: "10.0", assistsPerGame: "6.2", stealsPerGame: "3.7", blocksPerGame: "3.7", fieldGoalPct: "55.0" });

  // Kon Knueppel
  const knueppel = await storage.createPlayer({
    name: "Kon Knueppel",
    position: "SG",
    team: "Charlotte Hornets",
    height: "6'7\"",
    weight: "217 lbs",
    jerseyNumber: 7,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1642851.png",
    bio: "Kon Knueppel is an American professional basketball player for the Charlotte Hornets. The #4 overall pick in the 2025 NBA Draft out of Duke University, Knueppel is an elite shooter known for his textbook mechanics, high basketball IQ, and three-level scoring ability. He set NBA records as a rookie for fastest to 50 and 100 career three-pointers.",
    hometown: "Milwaukee, WI",
    birthDate: "2005-08-03",
  });
  await storage.createPlayerStats({ playerId: knueppel.id, season: "2025-26", team: "Charlotte Hornets", gamesPlayed: 52, pointsPerGame: "18.8", reboundsPerGame: "5.5", assistsPerGame: "3.5", stealsPerGame: "1.0", blocksPerGame: "0.3", fieldGoalPct: "48.5" });
  await storage.createPlayerStats({ playerId: knueppel.id, season: "2024-25", team: "Duke Blue Devils", league: "NCAA", gamesPlayed: 37, pointsPerGame: "14.4", reboundsPerGame: "4.0", assistsPerGame: "2.7", stealsPerGame: "1.0", blocksPerGame: "0.3", fieldGoalPct: "48.0" });
  await storage.createPlayerStats({ playerId: knueppel.id, season: "2023-24", team: "Wisconsin Lutheran", league: "HS", gamesPlayed: 30, pointsPerGame: "26.4", reboundsPerGame: "8.8", assistsPerGame: "5.1", stealsPerGame: "1.5", blocksPerGame: "0.5", fieldGoalPct: "52.0" });
  await storage.createPlayerStats({ playerId: knueppel.id, season: "2022-23", team: "Wisconsin Lutheran", league: "HS", gamesPlayed: 28, pointsPerGame: "19.7", reboundsPerGame: "9.2", assistsPerGame: "3.8", stealsPerGame: "1.3", blocksPerGame: "0.4", fieldGoalPct: "49.0" });

  // AJ Dybantsa
  const dybantsa = await storage.createPlayer({
    name: "AJ Dybantsa",
    position: "SF",
    team: "BYU Cougars",
    height: "6'9\"",
    weight: "210 lbs",
    jerseyNumber: 5,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/fallback.png",
    bio: "AJ Dybantsa is an American college basketball player for the BYU Cougars. The #1 ranked recruit in the 2025 class, Dybantsa is known for his elite scoring ability, two-way versatility, and advanced mid-range game. He won gold medals with USA Basketball at the FIBA U16 Americas, U17 World Cup, and U19 World Cup, earning tournament MVP honors at the U19 World Cup.",
    hometown: "Brockton, MA",
    birthDate: "2007-01-29",
  });
  await storage.createPlayerStats({ playerId: dybantsa.id, season: "2025-26", team: "BYU Cougars", league: "NCAA", gamesPlayed: 22, pointsPerGame: "23.9", reboundsPerGame: "6.4", assistsPerGame: "3.5", stealsPerGame: "1.2", blocksPerGame: "0.4", fieldGoalPct: "53.6" });
  await storage.createPlayerStats({ playerId: dybantsa.id, season: "2024-25", team: "Utah Prep Academy", league: "HS", gamesPlayed: 30, pointsPerGame: "24.2", reboundsPerGame: "8.1", assistsPerGame: "3.9", stealsPerGame: "1.5", blocksPerGame: "1.0", fieldGoalPct: "50.5" });
  await storage.createPlayerStats({ playerId: dybantsa.id, season: "2023-24", team: "Prolific Prep", league: "HS", gamesPlayed: 28, pointsPerGame: "22.8", reboundsPerGame: "7.5", assistsPerGame: "3.2", stealsPerGame: "1.4", blocksPerGame: "0.9", fieldGoalPct: "49.0" });
  await storage.createPlayerStats({ playerId: dybantsa.id, season: "2022-23", team: "Saint Sebastians School", league: "HS", gamesPlayed: 26, pointsPerGame: "19.1", reboundsPerGame: "9.6", assistsPerGame: "2.9", stealsPerGame: "1.1", blocksPerGame: "2.5", fieldGoalPct: "47.5" });

  await seedTeamRecords();

  // Awards Seeding
  await storage.createAward({ playerId: lebron.id, name: "NBA Champion", year: "2020" });
  await storage.createAward({ playerId: lebron.id, name: "NBA Finals MVP", year: "2020" });
  await storage.createAward({ playerId: lebron.id, name: "All-NBA First Team", year: "2020" });

  await storage.createAward({ playerId: curry.id, name: "NBA Champion", year: "2022" });
  await storage.createAward({ playerId: curry.id, name: "NBA Finals MVP", year: "2022" });
  await storage.createAward({ playerId: curry.id, name: "All-NBA First Team", year: "2021" });

  await storage.createAward({ playerId: jokic.id, name: "NBA MVP", year: "2024" });
  await storage.createAward({ playerId: jokic.id, name: "NBA MVP", year: "2022" });
  await storage.createAward({ playerId: jokic.id, name: "NBA MVP", year: "2021" });

  await storage.createAward({ playerId: kd.id, name: "NBA Champion", year: "2018" });
  await storage.createAward({ playerId: kd.id, name: "NBA Finals MVP", year: "2018" });

  await storage.createAward({ playerId: mj.id, name: "NBA MVP", year: "1998" });
  await storage.createAward({ playerId: mj.id, name: "NBA Champion", year: "1998" });
  await storage.createAward({ playerId: mj.id, name: "NBA Finals MVP", year: "1998" });

  await storage.createAward({ playerId: flagg.id, name: "NCAA National Player of the Year", year: "2025" });
  await storage.createAward({ playerId: flagg.id, name: "#1 Overall Draft Pick", year: "2025" });

  await storage.createAward({ playerId: knueppel.id, name: "ACC Tournament MVP", year: "2025" });
  await storage.createAward({ playerId: knueppel.id, name: "#4 Overall Draft Pick", year: "2025" });
  await storage.createAward({ playerId: knueppel.id, name: "Wisconsin Mr. Basketball", year: "2024" });

  await storage.createAward({ playerId: dybantsa.id, name: "FIBA U19 World Cup MVP", year: "2025" });
  await storage.createAward({ playerId: dybantsa.id, name: "Naismith HS Player of the Year Finalist", year: "2025" });
  await storage.createAward({ playerId: dybantsa.id, name: "Massachusetts Gatorade Player of the Year", year: "2023" });
}

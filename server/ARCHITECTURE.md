# Hoop Central backend architecture (scalable sports DB)

## Canonical schema (scrapers write here)

- **players** – One row per player (id, name, slug, birth_date, height, weight, position).
- **player_external_ids** – Links players to external sources (`source` + `external_id`), e.g. `sports_reference` / `patrick-ngongba-1`. Prevents duplicates.
- **leagues** – NCAA, NBA, G League, etc.
- **teams** – Schools or pro teams (linked to league).
- **seasons** – e.g. 2024-25.
- **player_seasons** – Where a player played (player + team + league + season + jersey, games).
- **player_season_stats** – Per-season stats (pts_per_g, trb_per_g, etc.) per player_season.

## Frontend tables (unchanged; API reads these)

- **player_info** – Current site player list/detail (synced from canonical).
- **player_stats** – Current site stats (synced from canonical).

## Flow

1. **NCAA scraper** (`server/scrapers/ncaaScraper.ts`): team page → roster → player page → writes to **canonical** (players, player_external_ids, player_seasons, player_season_stats). Uses `sports_reference` + URL slug for identity.
2. **Sync** (`server/sync/syncFrontendTables.ts`): Copies canonical → player_info + player_stats so the existing API and website keep working. Run after scraping or via `POST /api/sync/frontend`.
3. **API** – No change; still serves player_info/player_stats (same response shape).

## Folders

- **server/services/** – `playerService` (findOrCreatePlayer by external id), `leagueService` (getOrCreate league/team/season).
- **server/scrapers/** – NCAA scraper (canonical pipeline).
- **server/jobs/** – `scrapeNCAA` job (runs scraper + sync).
- **server/sync/** – `syncFrontendTables` (canonical → player_info, player_stats).
- **shared/canonicalSchema.ts** – Drizzle schema for canonical tables.

## NBA scraper

The NBA scraper writes to the canonical pipeline: **players**, **player_external_ids** (source `nba`, id = API playerId), **player_seasons**, **player_season_stats**, then runs sync. Entry: `server/scrapers/nbaScraper.ts`. `server/scraper.ts` re-exports `getCurrentNBASeason`, `seasonToDisplay`, `scrapeNBAPlayers` (which calls the canonical scraper with sync).

## Endpoints

- `POST /api/scraper/ncaa` – Run NCAA scraper (canonical + sync).
- `POST /api/sync/frontend` – Sync canonical → player_info / player_stats only.

# Scripts

## copySchema.sh — Copy Postgres schema between databases

Copies **schema only** (tables, columns, indexes, constraints) from a source Postgres database to a target. No data is copied. Uses `pg_dump --schema-only` and `psql`. Works with Railway Postgres connection URLs.

### Prerequisites

- `pg_dump` and `psql` on your PATH (install [PostgreSQL client tools](https://www.postgresql.org/download/) or use Postgres.app on macOS).

### Usage

1. **Make the script executable (once):**
   ```bash
   chmod +x scripts/copySchema.sh
   ```

2. **Run from project root** with the two Railway connection URLs:
   ```bash
   SOURCE_DATABASE_URL='postgresql://user:pass@host:port/railway' \
   TARGET_DATABASE_URL='postgresql://user:pass@host:port/railway' \
   ./scripts/copySchema.sh
   ```

3. **Or export variables first**, then run:
   ```bash
   export SOURCE_DATABASE_URL='postgresql://...'   # 2.0-Hoop-central
   export TARGET_DATABASE_URL='postgresql://...'   # Hoop-central
   ./scripts/copySchema.sh
   ```

### What it does

- Exports schema from `SOURCE_DATABASE_URL` with `pg_dump --schema-only --no-owner --no-privileges`.
- Writes it to **`schema.sql`** in the project root.
- Applies `schema.sql` to `TARGET_DATABASE_URL` with `psql`.

If any step fails, the script exits immediately (`set -euo pipefail`).

### Getting Railway URLs

In Railway: Project → your Postgres service → **Variables** or **Connect** tab. Copy the `DATABASE_URL` (or the full connection string) for each database and use as `SOURCE_DATABASE_URL` and `TARGET_DATABASE_URL`.

---

## dropOldTables.sh — Remove old tables so only 2.0 tables remain

Drops **only** the legacy tables: `player_info`, `player_stats`, `awards`, `team_records`, `site_settings`. Leaves all 2.0 canonical tables (leagues, teams, seasons, team_seasons, players, player_external_ids, player_seasons, player_season_stats, player_scrape_jobs) intact.

**When to use:** You already ran cleanTargetSchema but the app’s `db:push` re-created the old tables (because both schemas were in drizzle config). Now drizzle only pushes the canonical schema, so run this script once to drop the old tables; they won’t be re-created on deploy.

```bash
chmod +x scripts/dropOldTables.sh
DATABASE_URL='postgresql://...' ./scripts/dropOldTables.sh
```

# Database migrations

Run against your Postgres database when needed (e.g. after pull or on a new environment).

## 0001_player_stats_league.sql

Ensures `player_stats.league` exists so NCAA scraper and `/api/leagues/NCAA/teams` work.

**From project root (with DATABASE_URL or PG vars set):**
```bash
psql "$DATABASE_URL" -f server/migrations/0001_player_stats_league.sql
```

**Or from Railway:** use the same SQL in the Railway Postgres query tab / psql session.

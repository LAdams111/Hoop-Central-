# Hoop Central - Basketball Analytics Platform

## Overview

Hoop Central is a basketball player analytics web application that lets users browse NBA and G League player profiles, view career statistics, and analyze performance trends through interactive charts. The app features a dark-themed sports analytics UI with a player directory, individual player profiles with season-by-season stats, and data visualization using area/line charts. The database is seeded with legendary NBA players and G League players on first run.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Structure
The project follows a monorepo pattern with three main directories:
- **`client/`** — React single-page application (frontend)
- **`server/`** — Express.js API server (backend)
- **`shared/`** — Code shared between frontend and backend (schema, route definitions, types)

### Frontend (`client/src/`)
- **Framework**: React with TypeScript, bundled by Vite
- **Routing**: `wouter` (lightweight client-side router) with routes for Home (`/`), Player Directory (`/players`), Player Profile (`/players/:id`), Leagues (`/leagues`), and Team Roster (`/roster/:team/:season`)
- **State/Data Fetching**: TanStack React Query for server state management. Custom hooks in `client/src/hooks/use-players.ts` wrap API calls
- **UI Components**: shadcn/ui component library (new-york style) with Radix UI primitives. Components live in `client/src/components/ui/`
- **Styling**: Tailwind CSS with CSS variables for theming (dark sports analytics theme). Custom fonts: Teko (display), Outfit (body), JetBrains Mono (monospace)
- **Charts**: Recharts library for rendering player stat trends (area charts with gradients)
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend (`server/`)
- **Framework**: Express.js (v5) running on Node.js with TypeScript (executed via `tsx`)
- **API Pattern**: RESTful JSON API under `/api/` prefix. Routes defined in `server/routes.ts`, with route metadata shared via `shared/routes.ts`
- **Storage Layer**: `server/storage.ts` implements `IStorage` interface using `DatabaseStorage` class backed by Drizzle ORM. This abstraction makes swapping storage implementations straightforward
- **Dev Server**: Vite dev server is integrated as middleware during development (`server/vite.ts`), providing HMR. In production, static files are served from `dist/public`
- **Database Seeding**: The server auto-seeds the database with legendary NBA players and G League players if the players table is empty

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts` with two tables:
  - `players` — id, name, position, team, height, weight, jerseyNumber, headshotUrl, bio, profileViews
  - `player_stats` — id, playerId, season, team, league, gamesPlayed, ppg, rpg, apg, spg, bpg, fg_pct
- **Relations**: One-to-many relationship from players to player_stats
- **Validation**: `drizzle-zod` generates Zod schemas from table definitions for type-safe validation
- **Migrations**: Use `drizzle-kit push` (`npm run db:push`) to sync schema to database. Config in `drizzle.config.ts`
- **Connection**: Requires `DATABASE_URL` environment variable pointing to a PostgreSQL instance

### Shared Code (`shared/`)
- `schema.ts` — Database table definitions, relations, insert schemas, and TypeScript types
- `routes.ts` — API route metadata (paths, methods, Zod response schemas) and a `buildUrl` helper for URL parameter substitution. This ensures frontend and backend stay in sync on API contracts

### Build Process
- **Dev**: `npm run dev` runs the Express server with Vite middleware for HMR
- **Build**: `npm run build` runs `script/build.ts` which builds the client with Vite and bundles the server with esbuild (bundling common deps to reduce cold start time)
- **Production**: `npm start` serves the built app from `dist/`

### Key API Endpoints
- `GET /api/players` — List players, optional `?search=` and `?position=` query params
- `GET /api/players/:id` — Get player details with all season stats, increments profile view count
- `GET /api/teams/:team/roster/:season` — Get players who played for a team in a specific season
- `POST /api/players/:id/view` — Increment player profile view count
- `POST /api/scraper/nba` — Trigger NBA data scraper (fetches all current NBA players and stats)
- `GET /api/scraper/status` — Check if scraper is currently running

### NBA Data Scraper (`server/scraper.ts`)
- **Data Source**: nbaStats API (api.server.nbaapi.com) — free, no auth required
- **Scraper Page**: Available at `/scraper` in the app UI
- **Two modes**: "Current Season" (fast, single season) and "Full History" (all seasons 2002-03 to present)
- **Behavior**: Fetches all current NBA players with season totals, calculates per-game averages, and inserts/updates players and stats in the database
- **Player Matching**: Uses case-insensitive name matching to find existing players
- **Bio Enrichment**: Wikidata SPARQL bulk query (~168 players) + entity search fallback for unmatched players
- **Name Normalization**: Handles accents (Jokić→Jokic), suffixes (Jr./III), hyphens, dots for better matching
- **Unit-Aware Weight**: Detects kg (Q11570) vs lbs (Q100995) from Wikidata unit IDs for accurate conversion
- **Default headshot**: New scraped players get Lester Quinones' headshot (NBA ID 1631244) as default
- **Default profile views**: New scraped players start with 50 views
- **Season detection**: Automatically determines current NBA season based on current date

## External Dependencies

- **PostgreSQL** — Primary database, connected via `DATABASE_URL` environment variable using `pg` (node-postgres) connection pool
- **Google Fonts** — Teko, Outfit, JetBrains Mono fonts loaded via CDN in `index.html` and `index.css`
- **Replit Plugins** — Development-only Vite plugins for error overlay, cartographer, and dev banner (conditionally loaded when `REPL_ID` is set)
- **Replit Object Storage** — Used for storing admin-uploaded player headshot images
- **Admin Authentication** — Simple token-based admin auth using SESSION_SECRET as password. Admin can log in on player profiles to upload custom headshots. Admin login UI appears as a small lock icon in the bottom-right corner of player profile pages
- **No user authentication** — Currently no user-facing auth system; the navigation has a placeholder comment for future user profile/auth
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

let pool: pg.Pool | undefined;
let db: any;

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.RAILWAY_POSTGRESQL_URL ||
  process.env.RAILWAY_DATABASE_URL ||
  (process.env.PGHOST
    ? `postgres://${process.env.PGUSER || "postgres"}:${encodeURIComponent(
        process.env.PGPASSWORD || "",
      )}@${process.env.PGHOST}:${process.env.PGPORT || "5432"}/${
        process.env.PGDATABASE || process.env.PGDATABASE || "postgres"
      }`
    : undefined);

if (connectionString) {
  pool = new Pool({ connectionString });
  db = drizzle(pool, { schema });
} else {
  // Don't throw at import time; allow the server to start so static assets
  // can be served even when a database isn't provisioned (e.g. temporary
  // Railway deployments without a DB). Accessing `db` methods will throw
  // at runtime with a clear message.
  //
  // Note: production deployments should set `DATABASE_URL` in environment
  // variables (Railway project settings) so DB functionality is available.
  // See .env.example for required variables.
  //
  // Minimal stub implementing common query operations to fail fast.
  console.warn("No database connection string found; database features disabled. Set DATABASE_URL or PG* vars to enable DB functionality.");
  pool = undefined;
  const unavailable = () => {
    throw new Error("DATABASE_URL not set. Database unavailable.");
  };
  db = {
    select: unavailable,
    insert: unavailable,
    update: unavailable,
    delete: unavailable,
    // provide a generic proxy for fluent query builder usage
    __drizzle_stub: true,
  };
}

export { pool, db };

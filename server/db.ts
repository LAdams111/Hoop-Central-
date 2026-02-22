import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// Backend must use Railway Postgres: set DATABASE_URL in Railway variables (not local DB).
const connectionString = process.env.DATABASE_URL || process.env.RAILWAY_POSTGRESQL_URL;
const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool);
export { pool };

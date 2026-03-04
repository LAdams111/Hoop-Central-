import { defineConfig } from "drizzle-kit";

// Support multiple environment variable names (Railway and other providers)
const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.RAILWAY_POSTGRESQL_URL ||
  process.env.RAILWAY_DATABASE_URL ||
  process.env.POSTGRESQL_URL ||
  // If platform exposes PG_* variables, build a connection string
  (process.env.PGHOST
    ? `postgres://${process.env.PGUSER || "postgres"}:${encodeURIComponent(
        process.env.PGPASSWORD || "",
      )}@${process.env.PGHOST}:${process.env.PGPORT || "5432"}/${
        process.env.PGDATABASE || process.env.PGDATABASE || "postgres"
      }`
    : undefined);

if (!url) {
  throw new Error(
    "No database URL found. Set DATABASE_URL (or POSTGRES_URL / RAILWAY_POSTGRESQL_URL), or provide PGHOST/PGUSER/PGPASSWORD/PGDATABASE for drizzle-kit.",
  );
}

export default defineConfig({
  out: "./server/migrations",
  schema: ["./shared/schema.ts", "./shared/canonicalSchema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});

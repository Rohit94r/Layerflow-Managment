// Applies migrations to DATABASE_URL. Runs once per deploy on Vercel (see vercel.json buildCommand),
// so serverless instances never race to migrate at runtime.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.VERCEL) {
    // Fail the deploy with a clear reason instead of shipping an app that cannot reach a database.
    console.error("✖ DATABASE_URL is not set. Add your Postgres (e.g. Neon) connection string in Vercel → Project → Settings → Environment Variables, then redeploy.");
    process.exit(1);
  }
  console.log("DATABASE_URL not set; the embedded database migrates itself on startup.");
  process.exit(0);
}
// prepare:false keeps this compatible with connection poolers (Neon pooled URLs, PgBouncer).
const client = postgres(url, { max: 1, prepare: false });
try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("✓ Migrations applied.");
} finally {
  await client.end();
}

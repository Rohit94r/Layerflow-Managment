// Applies migrations to DATABASE_URL. Runs once per deploy on Vercel (see vercel.json buildCommand),
// so serverless instances never race to migrate at runtime.
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// On Vercel the variables are injected. Locally read .env.local so that
// `pnpm db:migrate` and the Vercel build command behave the same way.
for (const file of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m || process.env[m[1]] !== undefined) continue;
      const raw = m[2].trim();
      process.env[m[1]] = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
    }
  } catch {
    // File is optional.
  }
}

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

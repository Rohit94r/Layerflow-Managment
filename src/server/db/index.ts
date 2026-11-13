import path from "node:path";
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Both drivers expose the same Drizzle query API. We type against the PGlite
 * flavour and use it interchangeably with postgres-js.
 */
export type Db = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type State = { db: Db; ready: Promise<void> | null; kind: "pglite" | "postgres" };

const globalForDb = globalThis as unknown as { __productOsDb?: State };
const MIGRATIONS = path.join(process.cwd(), "drizzle");

function create(): State {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: 10, prepare: false });
    return { db: drizzlePostgres(client, { schema }) as unknown as Db, ready: null, kind: "postgres" };
  }
  // Zero-setup local database. Never used when DATABASE_URL is set.
  const dir = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  return { db: drizzlePglite(new PGlite(dir), { schema }), ready: null, kind: "pglite" };
}

function state(): State {
  // Cached on globalThis so dev hot-reload never opens a second PGlite on the same directory.
  globalForDb.__productOsDb ??= create();
  return globalForDb.__productOsDb;
}

/** Test hook: install an in-memory database. */
export function installDb(db: Db) {
  globalForDb.__productOsDb = { db, ready: Promise.resolve(), kind: "pglite" };
}

/** Applies pending migrations once per process. Safe to call on every request. */
export function ensureDb(): Promise<void> {
  const s = state();
  s.ready ??= (async () => {
    if (s.kind === "pglite") await migratePglite(s.db, { migrationsFolder: MIGRATIONS });
    else await migratePostgres(s.db as never, { migrationsFolder: MIGRATIONS });
  })().catch((err) => {
    s.ready = null;
    throw err;
  });
  return s.ready;
}

/** Lazily-created database handle. Creating it at import time would open the DB during `next build`. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = state().db;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };

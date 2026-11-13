import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { installDb, schema } from "../server/db";
import { newId } from "../lib/id";
import { loadContext, createWorkspace } from "../modules/identity/service";

/** Fresh in-memory Postgres with all migrations applied. */
export async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  installDb(db);
  return db;
}

export async function makeUser(name: string) {
  const { db } = await import("../server/db");
  const id = newId();
  await db.insert(schema.user).values({ id, name, email: `${name.toLowerCase()}-${id.slice(-6)}@example.com` });
  const [u] = await db.select().from(schema.user).where((await import("drizzle-orm")).eq(schema.user.id, id));
  return u!;
}

/** A user who owns a new workspace, plus their context. */
export async function makeOwner(name: string) {
  const user = await makeUser(name);
  const ws = await createWorkspace(user.id, { name: `${name}'s workspace` });
  const ctx = (await loadContext(user.id, ws.slug))!;
  return { user, ws, ctx };
}

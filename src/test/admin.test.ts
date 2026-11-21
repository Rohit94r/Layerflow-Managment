import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { freshDb, makeOwner } from "./setup-db";
import * as identity from "../modules/identity/service";
import { ADMIN } from "../server/auth/admin";
import { auth } from "../server/auth";
import { db, schema } from "../server/db";

const signIn = (password: string) => auth.api.signInEmail({ body: { email: ADMIN.email, password }, asResponse: true });

describe("built-in administrator", () => {
  let existing: Awaited<ReturnType<typeof makeOwner>>;
  let adminId: string;

  beforeAll(async () => {
    await freshDb();
    // A workspace that exists before the administrator account does.
    existing = await makeOwner("Erin");
    adminId = await identity.ensureAdminAccount();
  });

  it("can sign in with the configured email and password", async () => {
    expect((await signIn(ADMIN.password)).status).toBe(200);
    expect((await signIn("wrong-password")).status).toBe(401);
  });

  it("is idempotent", async () => {
    expect(await identity.ensureAdminAccount()).toBe(adminId);
    const users = await db.select().from(schema.user).where(eq(schema.user.email, ADMIN.email));
    const creds = await db.select().from(schema.account).where(and(eq(schema.account.userId, adminId), eq(schema.account.providerId, "credential")));
    expect(users).toHaveLength(1);
    expect(creds).toHaveLength(1);
  });

  it("restores the configured password if it was changed", async () => {
    await db.update(schema.account).set({ password: await hashPassword("something-else") }).where(eq(schema.account.userId, adminId));
    expect((await signIn(ADMIN.password)).status).toBe(401);
    await identity.ensureAdminAccount();
    expect((await signIn(ADMIN.password)).status).toBe(200);
  });

  it("owns workspaces that existed before it, and ones created later by others", async () => {
    expect((await identity.loadContext(adminId, existing.ws.slug))?.role).toBe("owner");
    const later = await makeOwner("Lena");
    expect((await identity.loadContext(adminId, later.ws.slug))?.role).toBe("owner");
    expect((await identity.listUserWorkspaces(adminId)).map((w) => w.slug)).toEqual(expect.arrayContaining([existing.ws.slug, later.ws.slug]));
  });

  it("cannot be demoted or removed by another owner", async () => {
    const members = await identity.listMembers(existing.ctx);
    const row = members.find((m) => m.userId === adminId)!;
    expect(row.isAdmin).toBe(true);
    await expect(identity.changeRole(existing.ctx, row.id, "viewer")).rejects.toMatchObject({ code: "forbidden" });
    await expect(identity.removeMember(existing.ctx, row.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("restores owner access on the next start if it was changed directly in the database", async () => {
    await db.update(schema.workspaceMember).set({ role: "viewer" }).where(and(eq(schema.workspaceMember.userId, adminId), eq(schema.workspaceMember.workspaceId, existing.ws.id)));
    await identity.ensureAdminAccount();
    expect((await identity.loadContext(adminId, existing.ws.slug))?.role).toBe("owner");
  });
});

describe("invitation-only sign-up", () => {
  let owner: Awaited<ReturnType<typeof makeOwner>>;
  beforeAll(async () => {
    await freshDb();
    owner = await makeOwner("Iris");
  });

  const signUp = (email: string) => auth.api.signUpEmail({ body: { email, password: "long-enough-pw", name: "New person" }, asResponse: true });

  it("rejects an email without an invitation", async () => {
    expect(await identity.canSignUp("stranger@example.com")).toBe(false);
    expect((await signUp("stranger@example.com")).status).toBe(403);
  });

  it("accepts an email with a pending invitation, case-insensitively", async () => {
    await identity.createInvitation(owner.ctx, { email: "Invited@Example.com", role: "member" });
    expect(await identity.canSignUp("INVITED@example.com")).toBe(true);
    expect((await signUp("invited@example.com")).status).toBe(200);
  });

  it("rejects an email whose invitation was revoked", async () => {
    await identity.createInvitation(owner.ctx, { email: "revoked@example.com", role: "member" });
    const [inv] = await identity.listInvitations(owner.ctx).then((r) => r.filter((i) => i.email === "revoked@example.com"));
    await identity.revokeInvitation(owner.ctx, inv!.id);
    expect((await signUp("revoked@example.com")).status).toBe(403);
  });

  it("always allows the administrator email", async () => {
    expect(await identity.canSignUp(ADMIN.email.toUpperCase())).toBe(true);
  });
});

describe("first workspace", () => {
  beforeAll(async () => {
    await freshDb();
  });

  it("is created automatically, named after the person, and only once", async () => {
    const { makeUser } = await import("./setup-db");
    const u = await makeUser("Rohit");
    const slug = await identity.ensureFirstWorkspace({ id: u.id, name: "Rohit Jadhav" });
    expect(await identity.ensureFirstWorkspace({ id: u.id, name: "Rohit Jadhav" })).toBe(slug);
    const mine = await identity.listUserWorkspaces(u.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: "Rohit's projects", role: "owner", slug });
  });
});

import { createHash } from "node:crypto";
import { and, asc, count, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { conflict, forbidden, invalid, notFound } from "../../lib/errors";
import { slugify } from "../../lib/format";
import { newToken } from "../../lib/id";
import { recordAudit } from "../audit/service";
import { INVITABLE_ROLES, RESERVED_SLUGS, ROLES, type Role } from "./constants";
import { invitation, user, workspace, workspaceMember } from "./schema";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const INVITE_TTL_DAYS = 7;

/* ---------------- Context ---------------- */

/** Resolves membership. Returns null for non-members so callers can 404 without revealing existence. */
export async function loadContext(userId: string, workspaceSlug: string): Promise<(Ctx & { workspace: typeof workspace.$inferSelect }) | null> {
  const [row] = await db
    .select({ ws: workspace, role: workspaceMember.role })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(and(eq(workspaceMember.userId, userId), eq(workspace.slug, workspaceSlug)))
    .limit(1);
  if (!row) return null;
  return { userId, workspaceId: row.ws.id, workspaceSlug: row.ws.slug, role: row.role, workspace: row.ws };
}

export async function listUserWorkspaces(userId: string) {
  return db
    .select({ id: workspace.id, name: workspace.name, slug: workspace.slug, role: workspaceMember.role })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(eq(workspaceMember.userId, userId))
    .orderBy(asc(workspace.name));
}

/* ---------------- Workspaces ---------------- */

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Use at least 2 characters.")
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and single dashes only.")
  .refine((s) => !RESERVED_SLUGS.has(s), "That address is reserved.");

export const workspaceInput = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  slug: z.string().optional(),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code.").default("USD"),
});

async function uniqueWorkspaceSlug(base: string) {
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const [hit] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.slug, candidate)).limit(1);
    if (!hit) return candidate;
    candidate = `${base}-${i}`;
  }
  throw conflict("Could not find a free workspace address.");
}

export async function createWorkspace(userId: string, raw: z.input<typeof workspaceInput>) {
  const input = workspaceInput.parse(raw);
  let slug: string;
  if (input.slug?.trim()) {
    const parsed = slugSchema.safeParse(input.slug);
    if (!parsed.success) throw invalid(parsed.error.issues[0]!.message, { slug: parsed.error.issues[0]!.message });
    const [taken] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.slug, parsed.data)).limit(1);
    if (taken) throw conflict("That workspace address is taken.");
    slug = parsed.data;
  } else {
    const base = slugify(input.name) || "workspace";
    slug = await uniqueWorkspaceSlug(RESERVED_SLUGS.has(base) ? `${base}-ws` : base);
  }

  return db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(workspace)
      .values({ name: input.name, slug, timezone: input.timezone, currency: input.currency, createdBy: userId })
      .returning();
    await tx.insert(workspaceMember).values({ workspaceId: ws!.id, userId, role: "owner" });
    await recordAudit(tx, { workspaceId: ws!.id, userId }, {
      action: "workspace.created", targetType: "workspace", targetId: ws!.id, targetLabel: ws!.name,
    });
    return ws!;
  });
}

export async function updateWorkspace(ctx: Ctx, raw: z.input<typeof workspaceInput>) {
  assertCan(ctx, "workspace.manage");
  const input = workspaceInput.parse(raw);
  const [before] = await db.select().from(workspace).where(eq(workspace.id, ctx.workspaceId));
  if (!before) throw notFound("Workspace");
  let slug = before.slug;
  if (input.slug && input.slug !== before.slug) {
    const parsed = slugSchema.safeParse(input.slug);
    if (!parsed.success) throw invalid(parsed.error.issues[0]!.message, { slug: parsed.error.issues[0]!.message });
    const [taken] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.slug, parsed.data)).limit(1);
    if (taken) throw conflict("That workspace address is taken.");
    slug = parsed.data;
  }
  return db.transaction(async (tx) => {
    const [ws] = await tx
      .update(workspace)
      .set({ name: input.name, slug, timezone: input.timezone, currency: input.currency, updatedAt: new Date() })
      .where(eq(workspace.id, ctx.workspaceId))
      .returning();
    await recordAudit(tx, ctx, { action: "workspace.updated", targetType: "workspace", targetId: ctx.workspaceId, targetLabel: input.name });
    return ws!;
  });
}

export async function deleteWorkspace(ctx: Ctx, confirmSlug: string) {
  assertCan(ctx, "workspace.delete");
  if (confirmSlug.trim() !== ctx.workspaceSlug) throw invalid("Type the workspace address exactly to confirm.");
  // Cascading foreign keys remove every tenant-owned row.
  await db.delete(workspace).where(eq(workspace.id, ctx.workspaceId));
}

/* ---------------- Members ---------------- */

export async function listMembers(ctx: Ctx) {
  assertCan(ctx, "members.view");
  return db
    .select({ id: workspaceMember.id, userId: user.id, name: user.name, email: user.email, role: workspaceMember.role, joinedAt: workspaceMember.createdAt })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(eq(workspaceMember.workspaceId, ctx.workspaceId))
    .orderBy(asc(user.name));
}

/** Lightweight list for owner/assignee pickers. Any member may see who is in the workspace. */
export async function listPeople(ctx: Ctx) {
  return db
    .select({ id: user.id, name: user.name })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(eq(workspaceMember.workspaceId, ctx.workspaceId))
    .orderBy(asc(user.name));
}

export async function isMember(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ id: workspaceMember.id })
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)))
    .limit(1);
  return Boolean(row);
}

async function ownerCount(workspaceId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.role, "owner")));
  return row?.n ?? 0;
}

async function getMember(ctx: Ctx, memberId: string) {
  const [m] = await db
    .select({ id: workspaceMember.id, userId: workspaceMember.userId, role: workspaceMember.role, name: user.name })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(and(eq(workspaceMember.id, memberId), eq(workspaceMember.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!m) throw notFound("Member");
  return m;
}

export async function changeRole(ctx: Ctx, memberId: string, role: Role) {
  assertCan(ctx, "members.manage");
  if (!ROLES.includes(role)) throw invalid("Unknown role.");
  const m = await getMember(ctx, memberId);
  // Only owners can create or demote owners.
  if ((role === "owner" || m.role === "owner") && ctx.role !== "owner") throw forbidden("Only an owner can change ownership.");
  if (m.role === "owner" && role !== "owner" && (await ownerCount(ctx.workspaceId)) <= 1) {
    throw conflict("A workspace needs at least one owner. Promote someone else first.");
  }
  await db.transaction(async (tx) => {
    await tx.update(workspaceMember).set({ role }).where(eq(workspaceMember.id, memberId));
    await recordAudit(tx, ctx, {
      action: "member.role_changed", targetType: "member", targetId: m.userId, targetLabel: m.name,
      changes: { role: { from: m.role, to: role } },
    });
  });
}

export async function removeMember(ctx: Ctx, memberId: string) {
  const m = await getMember(ctx, memberId);
  const self = m.userId === ctx.userId;
  if (!self) assertCan(ctx, "members.manage");
  if (m.role === "owner" && !self && ctx.role !== "owner") throw forbidden("Only an owner can remove an owner.");
  if (m.role === "owner" && (await ownerCount(ctx.workspaceId)) <= 1) {
    throw conflict("The last owner can't leave. Transfer ownership or delete the workspace.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(workspaceMember).where(eq(workspaceMember.id, memberId));
    await recordAudit(tx, ctx, { action: self ? "member.left" : "member.removed", targetType: "member", targetId: m.userId, targetLabel: m.name });
  });
}

/* ---------------- Invitations ---------------- */

export const inviteInput = z.object({
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  role: z.enum(INVITABLE_ROLES as [Role, ...Role[]]),
});

/** Creates an invitation and returns the one-time token. Only its hash is stored. */
export async function createInvitation(ctx: Ctx, raw: z.input<typeof inviteInput>) {
  assertCan(ctx, "members.manage");
  const input = inviteInput.parse(raw);
  if ((input.role === "admin") && ctx.role !== "owner" && ctx.role !== "admin") throw forbidden();

  const [existing] = await db
    .select({ id: user.id })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(and(eq(workspaceMember.workspaceId, ctx.workspaceId), sql`lower(${user.email}) = ${input.email}`))
    .limit(1);
  if (existing) throw conflict("That person is already a member.");

  const token = newToken();
  await db.transaction(async (tx) => {
    // Supersede any earlier pending invite for the same email.
    await tx
      .update(invitation)
      .set({ status: "revoked" })
      .where(and(eq(invitation.workspaceId, ctx.workspaceId), eq(invitation.email, input.email), eq(invitation.status, "pending")));
    const [inv] = await tx
      .insert(invitation)
      .values({
        workspaceId: ctx.workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedBy: ctx.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400000),
      })
      .returning();
    await recordAudit(tx, ctx, { action: "invitation.created", targetType: "invitation", targetId: inv!.id, targetLabel: `${input.email} (${input.role})` });
  });
  return token;
}

export async function listInvitations(ctx: Ctx) {
  assertCan(ctx, "members.manage");
  return db
    .select({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt })
    .from(invitation)
    .where(and(eq(invitation.workspaceId, ctx.workspaceId), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date())))
    .orderBy(asc(invitation.createdAt));
}

export async function revokeInvitation(ctx: Ctx, invitationId: string) {
  assertCan(ctx, "members.manage");
  await db.transaction(async (tx) => {
    const [inv] = await tx
      .update(invitation)
      .set({ status: "revoked" })
      .where(and(eq(invitation.id, invitationId), eq(invitation.workspaceId, ctx.workspaceId), eq(invitation.status, "pending")))
      .returning();
    if (!inv) throw notFound("Invitation");
    await recordAudit(tx, ctx, { action: "invitation.revoked", targetType: "invitation", targetId: inv.id, targetLabel: inv.email });
  });
}

export async function peekInvitation(token: string) {
  const [row] = await db
    .select({ inv: invitation, workspaceName: workspace.name, workspaceSlug: workspace.slug })
    .from(invitation)
    .innerJoin(workspace, eq(workspace.id, invitation.workspaceId))
    .where(eq(invitation.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  const usable = row.inv.status === "pending" && row.inv.expiresAt > new Date();
  return { email: row.inv.email, role: row.inv.role, workspaceName: row.workspaceName, workspaceSlug: row.workspaceSlug, usable, status: row.inv.status };
}

export async function acceptInvitation(userId: string, userEmail: string, token: string) {
  const [inv] = await db.select().from(invitation).where(eq(invitation.tokenHash, hashToken(token))).limit(1);
  if (!inv || inv.status !== "pending" || inv.expiresAt <= new Date()) throw invalid("This invitation is no longer valid.");
  if (inv.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that email to accept it.`);
  }
  const [ws] = await db.select().from(workspace).where(eq(workspace.id, inv.workspaceId));
  if (!ws) throw notFound("Workspace");
  await db.transaction(async (tx) => {
    await tx.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, inv.id));
    await tx.insert(workspaceMember).values({ workspaceId: inv.workspaceId, userId, role: inv.role }).onConflictDoNothing();
    await recordAudit(tx, { workspaceId: inv.workspaceId, userId }, {
      action: "member.joined", targetType: "member", targetId: userId, targetLabel: userEmail,
    });
  });
  return ws;
}

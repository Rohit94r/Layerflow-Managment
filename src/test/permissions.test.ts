import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, makeOwner, makeUser } from "./setup-db";
import * as identity from "../modules/identity/service";
import * as portfolio from "../modules/portfolio/service";
import * as work from "../modules/work/service";
import * as finance from "../modules/finance/service";
import { listActivity } from "../modules/audit/service";
import type { Role } from "../modules/identity/constants";

async function join(owner: Awaited<ReturnType<typeof makeOwner>>, name: string, role: Role) {
  const u = await makeUser(name);
  const token = await identity.createInvitation(owner.ctx, { email: u.email, role });
  await identity.acceptInvitation(u.id, u.email, token);
  return { user: u, ctx: (await identity.loadContext(u.id, owner.ws.slug))! };
}

describe("roles and permissions", () => {
  let owner: Awaited<ReturnType<typeof makeOwner>>;
  beforeAll(async () => {
    await freshDb();
    owner = await makeOwner("Olivia");
  });

  it("viewer can read but not write", async () => {
    const v = await join(owner, "Victor", "viewer");
    await expect(portfolio.listProducts(v.ctx)).resolves.toBeDefined();
    await expect(portfolio.createProduct(v.ctx, { name: "Nope" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(work.createTask(v.ctx, { title: "Nope" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(finance.listExpenses(v.ctx)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("billing manager sees finance but not work", async () => {
    const b = await join(owner, "Bianca", "billing");
    await expect(finance.createExpense(b.ctx, { vendor: "Vercel", amount: "20", currency: "USD" })).resolves.toBeDefined();
    await expect(work.listTasks(b.ctx)).rejects.toMatchObject({ code: "forbidden" });
    await expect(listActivity(b.ctx)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("member cannot manage members or archive products", async () => {
    const m = await join(owner, "Mia", "member");
    const p = await portfolio.createProduct(m.ctx, { name: "Mia's thing" });
    await expect(portfolio.setArchived(m.ctx, p.id, true)).rejects.toMatchObject({ code: "forbidden" });
    await expect(identity.createInvitation(m.ctx, { email: "x@example.com", role: "member" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("the last owner cannot leave or be demoted", async () => {
    const members = await identity.listMembers(owner.ctx);
    const me = members.find((m) => m.userId === owner.user.id)!;
    await expect(identity.removeMember(owner.ctx, me.id)).rejects.toMatchObject({ code: "conflict" });
    await expect(identity.changeRole(owner.ctx, me.id, "admin")).rejects.toMatchObject({ code: "conflict" });
  });

  it("admins cannot touch owners", async () => {
    const a = await join(owner, "Adam", "admin");
    const members = await identity.listMembers(owner.ctx);
    const ownerRow = members.find((m) => m.userId === owner.user.id)!;
    await expect(identity.changeRole(a.ctx, ownerRow.id, "member")).rejects.toMatchObject({ code: "forbidden" });
    await expect(identity.removeMember(a.ctx, ownerRow.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("invitations are single-use and bound to the invited email", async () => {
    const invitee = await makeUser("Ivy");
    const stranger = await makeUser("Sam");
    const token = await identity.createInvitation(owner.ctx, { email: invitee.email, role: "member" });
    await expect(identity.acceptInvitation(stranger.id, stranger.email, token)).rejects.toMatchObject({ code: "forbidden" });
    await identity.acceptInvitation(invitee.id, invitee.email, token);
    await expect(identity.acceptInvitation(invitee.id, invitee.email, token)).rejects.toMatchObject({ code: "invalid" });
    expect(await identity.loadContext(stranger.id, owner.ws.slug)).toBeNull();
  });

  it("revoked invitations cannot be accepted", async () => {
    const u = await makeUser("Rex");
    const token = await identity.createInvitation(owner.ctx, { email: u.email, role: "member" });
    const [inv] = await identity.listInvitations(owner.ctx).then((xs) => xs.filter((x) => x.email === u.email));
    await identity.revokeInvitation(owner.ctx, inv!.id);
    await expect(identity.acceptInvitation(u.id, u.email, token)).rejects.toMatchObject({ code: "invalid" });
  });
});

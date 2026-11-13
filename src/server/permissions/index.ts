import type { Role } from "../../modules/identity/constants";
import { forbidden } from "../../lib/errors";

export const CAPABILITIES = [
  "workspace.view",
  "workspace.manage",
  "workspace.delete",
  "members.view",
  "members.manage",
  "product.view",
  "product.create",
  "product.edit",
  "product.archive",
  "product.delete",
  "work.view",
  "work.edit",
  "docs.view",
  "docs.edit",
  "finance.view",
  "finance.edit",
  "audit.view",
  "data.export",
  "integration.view",
  "integration.manage",
  "seo.view",
  "seo.run",
  "planning.view",
  "planning.edit",
  "automation.view",
  "automation.manage",
  "agent.view",
  "agent.manage",
  "agent.run",
  "approval.decide",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ALL = new Set<Capability>(CAPABILITIES);
const set = (...caps: Capability[]) => new Set<Capability>(caps);

/** The single source of truth for what each role may do. */
export const ROLE_CAPABILITIES: Record<Role, Set<Capability>> = {
  owner: ALL,
  admin: new Set(CAPABILITIES.filter((c) => c !== "workspace.delete")),
  manager: set(
    "workspace.view", "members.view", "product.view", "product.create", "product.edit", "product.archive",
    "product.delete", "work.view", "work.edit", "docs.view", "docs.edit", "finance.view", "finance.edit",
    "audit.view", "data.export", "integration.view", "integration.manage", "seo.view", "seo.run",
    "planning.view", "planning.edit", "automation.view", "automation.manage", "agent.view", "agent.manage",
    "agent.run", "approval.decide",
  ),
  member: set(
    "workspace.view", "members.view", "product.view", "product.create", "product.edit", "work.view", "work.edit",
    "docs.view", "docs.edit", "audit.view", "integration.view", "seo.view", "seo.run", "planning.view",
    "planning.edit", "automation.view", "agent.view", "agent.run",
  ),
  viewer: set(
    "workspace.view", "members.view", "product.view", "work.view", "docs.view", "audit.view", "integration.view",
    "seo.view", "planning.view", "automation.view", "agent.view",
  ),
  guest: set("workspace.view", "product.view", "work.view", "planning.view"),
  billing: set("workspace.view", "members.view", "product.view", "finance.view", "finance.edit", "planning.view"),
};

export function roleCan(role: Role, cap: Capability) {
  return ROLE_CAPABILITIES[role]?.has(cap) ?? false;
}

/** Everything a service needs to know about who is acting and where. */
export type Ctx = {
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
  role: Role;
  /** Who is really acting. Automations and agents act on behalf of their owner but are audited as themselves. */
  actor?: "human" | "system" | "agent";
};

export function can(ctx: Ctx, cap: Capability) {
  return roleCan(ctx.role, cap);
}

export function assertCan(ctx: Ctx, cap: Capability) {
  if (!roleCan(ctx.role, cap)) throw forbidden();
}

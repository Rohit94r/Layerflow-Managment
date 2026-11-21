export const ROLES = ["owner", "admin", "manager", "member", "viewer", "guest", "billing"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
  guest: "Guest",
  billing: "Billing manager",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including deleting the workspace.",
  admin: "Manage members, settings and every module.",
  manager: "Manage projects, work, docs and finance.",
  member: "Create and edit projects, tasks and docs.",
  viewer: "Read everything except finance.",
  guest: "Read projects and work only.",
  billing: "View and manage finance only.",
};

/** Roles an inviter may assign. Ownership is never handed out by invitation. */
export const INVITABLE_ROLES = ROLES.filter((r) => r !== "owner");

export const RESERVED_SLUGS = new Set([
  "api", "app", "w", "sign-in", "sign-up", "onboarding", "invite", "settings", "admin", "new",
]);

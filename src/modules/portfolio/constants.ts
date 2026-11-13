export const PRODUCT_TYPES = [
  "saas", "website", "mobile_app", "api", "marketplace", "service",
  "internal_tool", "client_project", "content_site", "community", "other",
] as const;
export const PRODUCT_ROLES = ["primary", "secondary", "supporting", "experimental", "client", "internal"] as const;
export const LIFECYCLES = [
  "idea", "research", "validating", "planning", "building", "alpha", "private_beta",
  "public_beta", "live", "growth", "maintenance", "paused", "sunset_planned", "sunset", "archived",
] as const;
export const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export const FOCUSES = [
  "none", "current_focus", "favorite", "featured", "needs_attention", "at_risk", "on_hold", "recently_launched",
] as const;
export const HEALTHS = ["healthy", "watch", "at_risk", "critical", "unknown"] as const;
export const LINK_KINDS = ["domain", "app", "staging", "docs", "repository", "analytics", "other"] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];
export type ProductRole = (typeof PRODUCT_ROLES)[number];
export type Lifecycle = (typeof LIFECYCLES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Focus = (typeof FOCUSES)[number];
export type Health = (typeof HEALTHS)[number];
export type LinkKind = (typeof LINK_KINDS)[number];

export const LABELS: Record<string, string> = {
  saas: "SaaS", website: "Website", mobile_app: "Mobile app", api: "API", marketplace: "Marketplace",
  service: "Service", internal_tool: "Internal tool", client_project: "Client project",
  content_site: "Content site", community: "Community", other: "Other",
  primary: "Primary", secondary: "Secondary", supporting: "Supporting", experimental: "Experimental",
  client: "Client", internal: "Internal",
  idea: "Idea", research: "Research", validating: "Validating", planning: "Planning", building: "Building",
  alpha: "Alpha", private_beta: "Private beta", public_beta: "Public beta", live: "Live", growth: "Growth",
  maintenance: "Maintenance", paused: "Paused", sunset_planned: "Sunset planned", sunset: "Sunset",
  archived: "Archived",
  p0: "P0 Critical", p1: "P1 High", p2: "P2 Normal", p3: "P3 Low",
  none: "—", current_focus: "Current focus", favorite: "Favorite", featured: "Featured",
  needs_attention: "Needs attention", at_risk: "At risk", on_hold: "On hold", recently_launched: "Recently launched",
  healthy: "Healthy", watch: "Watch", critical: "Critical", unknown: "Unknown",
  domain: "Domain", app: "App", staging: "Staging", docs: "Docs", repository: "Repository", analytics: "Analytics",
};

export const label = (v: string | null | undefined) => (v ? (LABELS[v] ?? v) : "—");

/** Lifecycle stages grouped for the portfolio pipeline strip. */
export const LIFECYCLE_PHASES: { name: string; stages: Lifecycle[] }[] = [
  { name: "Discover", stages: ["idea", "research", "validating"] },
  { name: "Build", stages: ["planning", "building", "alpha", "private_beta", "public_beta"] },
  { name: "Operate", stages: ["live", "growth", "maintenance"] },
  { name: "Wind down", stages: ["paused", "sunset_planned", "sunset", "archived"] },
];

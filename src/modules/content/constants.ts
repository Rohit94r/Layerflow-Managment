/** Editorial workflow. Each state has one meaning; nothing skips straight to "published" without a recorded action. */
export const POST_STATUSES = ["idea", "draft", "in_review", "approved", "scheduled", "published", "archived"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const SEARCH_INTENTS = ["informational", "commercial", "transactional", "navigational"] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const FUNNEL_STAGES = ["awareness", "consideration", "decision", "retention"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/**
 * Who may publish without a per-post human decision.
 * - manual: only people with content.publish publish; agents can only draft.
 * - approval: agents may request publishing; each request waits in the approvals queue (default).
 * - auto: agent publish requests go straight to the schedule. Must be switched on explicitly by an owner/admin.
 */
export const PUBLISH_POLICIES = ["manual", "approval", "auto"] as const;
export type PublishPolicy = (typeof PUBLISH_POLICIES)[number];

export const DESTINATIONS = ["hosted", "webhook"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const POST_LABELS: Record<string, string> = {
  idea: "Idea", draft: "Draft", in_review: "In review", approved: "Approved", scheduled: "Scheduled", published: "Published", archived: "Archived",
  informational: "Informational", commercial: "Commercial", transactional: "Transactional", navigational: "Navigational",
  awareness: "Awareness", consideration: "Consideration", decision: "Decision", retention: "Retention",
  manual: "Manual only", approval: "Agents need approval", auto: "Agents publish automatically",
  hosted: "Hosted blog", webhook: "Webhook to my site",
};
export const postLabel = (v: string) => POST_LABELS[v] ?? v;

export const STATUS_TONE: Record<PostStatus, "neutral" | "cobalt" | "good" | "warn" | "outline"> = {
  idea: "outline", draft: "neutral", in_review: "warn", approved: "cobalt", scheduled: "cobalt", published: "good", archived: "outline",
};

/** Allowed manual transitions. Publishing and scheduling go through dedicated service calls. */
export const TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  idea: ["draft", "archived"],
  draft: ["in_review", "approved", "archived", "idea"],
  in_review: ["draft", "approved", "archived"],
  approved: ["draft", "archived"],
  scheduled: ["approved", "draft"],
  published: ["archived", "draft"],
  archived: ["draft"],
};

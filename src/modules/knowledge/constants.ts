export const DOC_KINDS = ["doc", "decision", "prd", "runbook", "meeting", "research", "report"] as const;
export const DOC_STATUSES = ["draft", "active", "superseded", "archived"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export type DocStatus = (typeof DOC_STATUSES)[number];

export const DOC_LABELS: Record<string, string> = {
  doc: "Document", decision: "Decision", prd: "PRD", runbook: "Runbook", meeting: "Meeting notes",
  research: "Research", report: "Report", draft: "Draft", active: "Active", superseded: "Superseded", archived: "Archived",
};
export const docLabel = (v: string) => DOC_LABELS[v] ?? v;

export const DOC_TEMPLATES: Record<DocKind, string> = {
  doc: "",
  decision:
    "## Context\n\nWhat problem are we deciding on, and why now?\n\n## Options considered\n\n1. \n2. \n\n## Decision\n\n\n## Trade-offs and risks\n\n\n## Follow-up\n\n",
  prd:
    "## Problem\n\n\n## Target user\n\n\n## User stories\n\n- As a …, I want …, so that …\n\n## Scope and non-goals\n\n\n## Acceptance criteria\n\n- [ ] \n\n## Success metric\n\n",
  runbook: "## When to use this\n\n\n## Steps\n\n1. \n\n## Rollback\n\n\n## Contacts\n\n",
  meeting: "## Attendees\n\n\n## Notes\n\n\n## Decisions\n\n\n## Action items\n\n- [ ] \n",
  research: "## Question\n\n\n## Method\n\n\n## Findings\n\n\n## Implications\n\n",
  report: "## Summary\n\n\n## Details\n\n",
};

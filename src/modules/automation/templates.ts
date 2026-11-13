import { and, eq, gte, inArray, isNotNull, lt, lte, desc } from "drizzle-orm";
import { db } from "../../server/db";
import { addDays, money, today } from "../../lib/format";
import { expense } from "../finance/schema";
import { MONTHLY_FACTOR } from "../finance/constants";
import { product } from "../portfolio/schema";
import { task } from "../work/schema";
import { OPEN_STATUSES } from "../work/constants";
import { integrationConnection } from "../integrations/schema";
import { seoInsight, uptimeCheck } from "../seo/schema";
import { budget } from "../planning/schema";
import { membersWithCapability } from "./inbox";

/**
 * A template evaluates its trigger + conditions and returns proposed effects.
 * The engine handles dedupe, dry-run, approvals, execution and audit uniformly.
 */
export type Effect =
  | { kind: "notify"; dedupeKey: string; target: string; recipients: string[]; title: string; body: string; href?: string; severity: "info" | "warning" | "critical" }
  | { kind: "task.create"; dedupeKey: string; target: string; payload: Record<string, unknown>; after?: (taskId: string) => Promise<void> }
  | { kind: "doc.create"; dedupeKey: string; target: string; payload: Record<string, unknown>; notify: string[] };

type Param = { key: string; label: string; type: "number" | "select"; default: number | string; options?: string[] };
export type Template = {
  key: string;
  name: string;
  trigger: string;
  description: string;
  actionLabel: string;
  params: Param[];
  canRequireApproval: boolean;
  evaluate: (workspaceId: string, slug: string, params: Record<string, number | string | boolean>, productId: string | null) => Promise<Effect[]>;
};

const owners = (workspaceId: string) => membersWithCapability(workspaceId, "workspace.manage");

export const TEMPLATES: Template[] = [
  {
    key: "renewal_reminder",
    name: "Renewal reminder",
    trigger: "Daily · a cost renews within N days",
    description: "Notifies the cost owner (or finance managers) before a subscription or domain renews.",
    actionLabel: "Inbox notification",
    params: [{ key: "days", label: "Days before renewal", type: "number", default: 14 }],
    canRequireApproval: false,
    async evaluate(ws, slug, p, productId) {
      const t = today();
      const rows = await db.select().from(expense).where(and(
        eq(expense.workspaceId, ws), eq(expense.status, "active"), gte(expense.nextRenewalDate, t), lte(expense.nextRenewalDate, addDays(t, Number(p.days ?? 14))),
        ...(productId ? [eq(expense.productId, productId)] : []),
      ));
      const fallback = await membersWithCapability(ws, "finance.edit");
      return rows.map((e) => ({
        kind: "notify" as const, dedupeKey: `${e.id}:${e.nextRenewalDate}`, target: e.vendor,
        recipients: e.ownerId ? [e.ownerId] : fallback, severity: "warning" as const,
        title: `${e.vendor} renews on ${e.nextRenewalDate}`, body: `${money(e.amountMinor, e.currency)} (${e.recurrence}). Renew, downgrade or cancel before then.`,
        href: `/w/${slug}/finance`,
      }));
    },
  },
  {
    key: "overdue_escalation",
    name: "Overdue critical task escalation",
    trigger: "Daily · urgent/high task overdue by N days",
    description: "Escalates overdue high-priority work to the assignee and the product owner.",
    actionLabel: "Inbox notification",
    params: [{ key: "graceDays", label: "Days overdue", type: "number", default: 1 }],
    canRequireApproval: false,
    async evaluate(ws, slug, p, productId) {
      const cutoff = addDays(today(), -Number(p.graceDays ?? 1));
      const rows = await db.select({ t: task, ownerId: product.ownerId, productName: product.name }).from(task).leftJoin(product, eq(product.id, task.productId))
        .where(and(eq(task.workspaceId, ws), inArray(task.status, OPEN_STATUSES), inArray(task.priority, ["urgent", "high"]), lt(task.dueDate, cutoff), ...(productId ? [eq(task.productId, productId)] : [])));
      return rows.map(({ t, ownerId, productName }) => ({
        kind: "notify" as const, dedupeKey: `${t.id}:${t.dueDate}`, target: `#${t.number}`,
        recipients: [t.assigneeId, ownerId].filter((x): x is string => Boolean(x)), severity: "critical" as const,
        title: `Overdue ${t.priority} task #${t.number}: ${t.title}`, body: `Was due ${t.dueDate}${productName ? ` · ${productName}` : ""}.`, href: `/w/${slug}/work/${t.number}`,
      }));
    },
  },
  {
    key: "review_due",
    name: "Product review due",
    trigger: "Daily · a product's next review date has arrived",
    description: "Reminds the product owner to run the scheduled review.",
    actionLabel: "Inbox notification",
    params: [],
    canRequireApproval: false,
    async evaluate(ws, slug, _p, productId) {
      const rows = await db.select().from(product).where(and(eq(product.workspaceId, ws), isNotNull(product.nextReviewDate), lte(product.nextReviewDate, today()), ...(productId ? [eq(product.id, productId)] : [])));
      const fallback = await owners(ws);
      return rows.filter((p) => !p.archivedAt).map((p) => ({
        kind: "notify" as const, dedupeKey: `${p.id}:${p.nextReviewDate}`, target: p.name, recipients: p.ownerId ? [p.ownerId] : fallback,
        severity: "info" as const, title: `Review due: ${p.name}`, body: `Scheduled for ${p.nextReviewDate}. Update stage, health and priority, then set the next review date.`,
        href: `/w/${slug}/products/${p.slug}`,
      }));
    },
  },
  {
    key: "uptime_incident",
    name: "Site down → urgent bug",
    trigger: "After each uptime check · latest check failed",
    description: "Opens an urgent bug on the product when its site fails an uptime check (once per URL per day).",
    actionLabel: "Create task",
    params: [],
    canRequireApproval: true,
    async evaluate(ws, _slug, _p, productId) {
      const since = new Date(Date.now() - 6 * 3600 * 1000);
      const rows = await db.select().from(uptimeCheck).where(and(eq(uptimeCheck.workspaceId, ws), gte(uptimeCheck.checkedAt, since), ...(productId ? [eq(uptimeCheck.productId, productId)] : []))).orderBy(desc(uptimeCheck.checkedAt));
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!latest.has(`${r.productId}|${r.url}`)) latest.set(`${r.productId}|${r.url}`, r);
      return [...latest.values()].filter((r) => !r.ok).map((r) => ({
        kind: "task.create" as const, dedupeKey: `${r.productId}:${r.url}:${today()}`, target: r.url,
        payload: { title: `Site down: ${r.url.replace(/^https?:\/\//, "")}`, type: "bug", priority: "urgent", productId: r.productId,
          description: `Uptime check failed at ${r.checkedAt.toISOString()}: ${r.error ?? `HTTP ${r.statusCode}`}.\n\nCreated by the “Site down → urgent bug” automation.` },
      }));
    },
  },
  {
    key: "seo_opportunity_task",
    name: "SEO opportunity → proposed task",
    trigger: "After each Search Console sync · new high-confidence insight",
    description: "Proposes a task for each strong SEO opportunity. With approval on, a human confirms each one.",
    actionLabel: "Create task",
    params: [{ key: "minConfidence", label: "Minimum confidence", type: "select", default: "high", options: ["high", "medium"] }],
    canRequireApproval: true,
    async evaluate(ws, _slug, p, productId) {
      const levels = p.minConfidence === "medium" ? ["high", "medium"] : ["high"];
      const rows = await db.select().from(seoInsight).where(and(eq(seoInsight.workspaceId, ws), eq(seoInsight.status, "open"), inArray(seoInsight.confidence, levels as ("high" | "medium")[]), ...(productId ? [eq(seoInsight.productId, productId)] : [])));
      return rows.map((i) => ({
        kind: "task.create" as const, dedupeKey: i.id, target: i.key,
        payload: { title: i.title.slice(0, 200), type: i.kind.startsWith("declining") ? "bug" : "feature", priority: i.confidence === "high" ? "high" : "medium", productId: i.productId,
          description: `${i.nextAction}\n\n### Evidence (Google Search Console)\n${Object.entries(i.evidence).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\nProposed by the “SEO opportunity → task” automation.` },
        after: async (taskId: string) => {
          await db.update(seoInsight).set({ status: "task_created", taskId }).where(eq(seoInsight.id, i.id));
        },
      }));
    },
  },
  {
    key: "integration_failure",
    name: "Integration failure alert",
    trigger: "Daily · a connection is failing or needs reauthorisation",
    description: "Tells the person who connected the integration so data doesn't silently go stale.",
    actionLabel: "Inbox notification",
    params: [],
    canRequireApproval: false,
    async evaluate(ws, slug) {
      const rows = await db.select().from(integrationConnection).where(and(eq(integrationConnection.workspaceId, ws), inArray(integrationConnection.status, ["error", "needs_reauth"])));
      const fallback = await owners(ws);
      return rows.map((c) => ({
        kind: "notify" as const, dedupeKey: `${c.id}:${today()}`, target: c.accountLabel, recipients: c.connectedBy ? [c.connectedBy] : fallback,
        severity: "critical" as const, title: `${c.provider === "google_search_console" ? "Search Console" : c.provider} ${c.status === "needs_reauth" ? "needs reconnecting" : "sync is failing"}`,
        body: c.lastError ?? "", href: `/w/${slug}/integrations`,
      }));
    },
  },
  {
    key: "budget_threshold",
    name: "Budget threshold",
    trigger: "Daily · monthly run-rate reaches N% of a budget",
    description: "Warns finance managers when recurring costs approach a product or workspace budget (same currency only).",
    actionLabel: "Inbox notification",
    params: [{ key: "percent", label: "Threshold %", type: "number", default: 90 }],
    canRequireApproval: false,
    async evaluate(ws, slug, p) {
      const [budgets, costs] = await Promise.all([
        db.select({ b: budget, productName: product.name }).from(budget).leftJoin(product, eq(product.id, budget.productId)).where(eq(budget.workspaceId, ws)),
        db.select().from(expense).where(and(eq(expense.workspaceId, ws), eq(expense.status, "active"))),
      ]);
      const recipients = await membersWithCapability(ws, "finance.edit");
      const month = today().slice(0, 7);
      return budgets.flatMap(({ b, productName }) => {
        const runRate = costs.filter((e) => e.currency === b.currency && (b.productId ? e.productId === b.productId : true))
          .reduce((s, e) => s + e.amountMinor * MONTHLY_FACTOR[e.recurrence], 0);
        const share = b.monthlyAmountMinor ? runRate / b.monthlyAmountMinor : 0;
        if (share * 100 < Number(p.percent ?? 90)) return [];
        return [{
          kind: "notify" as const, dedupeKey: `${b.id}:${month}`, target: productName ?? "Workspace", recipients, severity: share >= 1 ? "critical" as const : "warning" as const,
          title: `${productName ?? "Workspace"} costs at ${Math.round(share * 100)}% of budget`,
          body: `Run-rate ${money(Math.round(runRate), b.currency)}/mo vs budget ${money(b.monthlyAmountMinor, b.currency)}/mo.`, href: `/w/${slug}/finance`,
        }];
      });
    },
  },
  {
    key: "weekly_digest",
    name: "Weekly portfolio digest",
    trigger: "Weekly · first run each ISO week",
    description: "Writes a digest report (completed and new work, overdue items, renewals, open SEO opportunities) and notifies members.",
    actionLabel: "Create report",
    params: [],
    canRequireApproval: false,
    async evaluate(ws) {
      const t = today();
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      const [done, created, overdue, renewals, insights, products] = await Promise.all([
        db.select().from(task).where(and(eq(task.workspaceId, ws), eq(task.status, "done"), gte(task.completedAt, weekAgo))),
        db.select().from(task).where(and(eq(task.workspaceId, ws), gte(task.createdAt, weekAgo))),
        db.select().from(task).where(and(eq(task.workspaceId, ws), inArray(task.status, OPEN_STATUSES), lt(task.dueDate, t))),
        db.select().from(expense).where(and(eq(expense.workspaceId, ws), eq(expense.status, "active"), gte(expense.nextRenewalDate, t), lte(expense.nextRenewalDate, addDays(t, 14)))),
        db.select().from(seoInsight).where(and(eq(seoInsight.workspaceId, ws), eq(seoInsight.status, "open"))),
        db.select().from(product).where(eq(product.workspaceId, ws)),
      ]);
      const week = isoWeek(new Date());
      const list = (xs: string[], empty: string) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : `_${empty}_`);
      const body = [
        `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from workspace records. Period: last 7 days.`,
        `## Work completed (${done.length})`, list(done.slice(0, 20).map((x) => `#${x.number} ${x.title}`), "Nothing completed."),
        `## New work (${created.length})`, list(created.slice(0, 20).map((x) => `#${x.number} ${x.title}`), "No new tasks."),
        `## Overdue (${overdue.length})`, list(overdue.slice(0, 20).map((x) => `#${x.number} ${x.title} — due ${x.dueDate}`), "Nothing overdue."),
        `## Renewals in the next 14 days (${renewals.length})`, list(renewals.map((e) => `${e.vendor} — ${money(e.amountMinor, e.currency)} on ${e.nextRenewalDate}`), "None."),
        `## Open SEO opportunities (${insights.length})`, list(insights.slice(0, 10).map((i) => i.title), "None, or Search Console not connected."),
        `## Portfolio`, list(products.filter((p) => !p.archivedAt).map((p) => `${p.name}: ${p.lifecycle}, health ${p.health}, ${p.priority.toUpperCase()}`), "No products."),
        `## Missing inputs`, "Revenue and analytics appear here only when recorded or connected; absent data is not treated as zero.",
      ].join("\n\n");
      const members = await membersWithCapability(ws, "docs.view");
      return [{ kind: "doc.create" as const, dedupeKey: week, target: week, notify: members, payload: { title: `Weekly digest — ${week}`, kind: "report", status: "active", body } }];
    },
  },
];

export function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const templateByKey = (k: string) => TEMPLATES.find((t) => t.key === k);

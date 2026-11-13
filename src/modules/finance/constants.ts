export const EXPENSE_CATEGORIES = [
  "hosting", "database", "domain", "email", "api", "ai", "analytics", "saas", "contractor",
  "marketing", "legal", "other",
] as const;
export const RECURRENCES = ["one_time", "monthly", "quarterly", "yearly"] as const;
export const REVENUE_KINDS = ["subscription", "one_time", "services", "other"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type Recurrence = (typeof RECURRENCES)[number];
export type RevenueKind = (typeof REVENUE_KINDS)[number];

export const FINANCE_LABELS: Record<string, string> = {
  hosting: "Hosting", database: "Database", domain: "Domain", email: "Email", api: "API",
  ai: "AI / tokens", analytics: "Analytics", saas: "SaaS tool", contractor: "Contractor",
  marketing: "Marketing", legal: "Legal", other: "Other",
  one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
  subscription: "Subscription", services: "Services",
};
export const financeLabel = (v: string) => FINANCE_LABELS[v] ?? v;

/** Monthly-equivalent factor. One-time costs are excluded from run-rate. */
export const MONTHLY_FACTOR: Record<Recurrence, number> = {
  one_time: 0,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

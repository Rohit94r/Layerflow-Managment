/**
 * The integration catalog. Only providers with a working adapter are "available";
 * the rest are listed honestly as planned (master prompt §14: a candidate catalog, not a claim).
 */
export type CatalogEntry = {
  id: string;
  name: string;
  category: string;
  description: string;
  purpose: string;
  scopes: { scope: string; why: string }[];
  dataStored: string;
  sync: string;
  envVars: string[];
  state: "available" | "planned";
};

export const CATALOG: CatalogEntry[] = [
  {
    id: "google_search_console",
    name: "Google Search Console",
    category: "SEO",
    description: "Clicks, impressions, CTR and position for your sites, with query and page breakdowns.",
    purpose: "Powers the SEO dashboard, evidence-backed SEO opportunities and traffic-decline alerts.",
    scopes: [
      { scope: "webmasters.readonly", why: "Read Search Console performance data. Read-only: nothing is changed in your Google account." },
      { scope: "openid email", why: "Show which Google account is connected." },
    ],
    dataStored: "Daily totals for 90 days and the top 500 queries and pages for the last two 28-day windows. Tokens are encrypted.",
    sync: "On connect, on demand, and daily via the scheduler. Google's data typically lags 2–3 days.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    state: "available",
  },
  { id: "github", name: "GitHub", category: "Code", description: "Repositories, pull requests, issues and releases.", purpose: "Link repos to products; release and PR activity.", scopes: [], dataStored: "", sync: "", envVars: [], state: "planned" },
  { id: "vercel", name: "Vercel", category: "Hosting", description: "Deployments and their status per project.", purpose: "Failed-deployment alerts and release history.", scopes: [], dataStored: "", sync: "", envVars: [], state: "planned" },
  { id: "stripe", name: "Stripe", category: "Payments", description: "MRR, subscriptions, refunds and churn.", purpose: "Replace manual revenue entries with synced data.", scopes: [], dataStored: "", sync: "", envVars: [], state: "planned" },
  { id: "posthog", name: "PostHog", category: "Analytics", description: "Signups, activation and retention events.", purpose: "Product analytics KPIs per product.", scopes: [], dataStored: "", sync: "", envVars: [], state: "planned" },
  {
    id: "google_analytics",
    name: "Google Analytics 4",
    category: "Analytics",
    description: "Sessions, users, page views, engagement and key events (conversions), with channel and landing-page breakdowns.",
    purpose: "Powers the Growth dashboard, traffic-drop alerts and the Growth Analyst agent.",
    scopes: [
      { scope: "analytics.readonly", why: "Read GA4 reports. Read-only: nothing in your Analytics account is changed." },
      { scope: "openid email", why: "Show which Google account is connected." },
    ],
    dataStored: "Daily totals for 90 days and channel, landing page and device breakdowns for the last two 28-day windows. Aggregated only; no user-level data. Tokens are encrypted.",
    sync: "On connect, on demand, and daily via the scheduler. The most recent 1–2 days may still be processing at Google.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    state: "available",
  },
];

export function isConfigured(entry: CatalogEntry) {
  return entry.state === "available" && entry.envVars.every((v) => Boolean(process.env[v]));
}

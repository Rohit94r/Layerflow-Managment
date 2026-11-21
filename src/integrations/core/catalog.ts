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
  { id: "github", name: "GitHub", category: "Code", description: "Repositories, pull requests, issues and releases.", purpose: "Link repos to projects; release and PR activity.", scopes: [], dataStored: "", sync: "", envVars: [], state: "planned" },
  {
    id: "vercel",
    name: "Vercel",
    category: "Hosting",
    description: "Deployments of your Next.js (or any) sites per project: live, building or failed, with branch, commit and build logs.",
    purpose: "Deployment status on each project, failed-production-deploy alerts and attention signals, and the project's domain and repository links filled in for uptime checks and the site audit.",
    scopes: [
      { scope: "projects:read", why: "List your Vercel projects so you can link each one to a project here." },
      { scope: "deployments:read", why: "State, branch, commit and build-log link of recent deployments." },
      { scope: "domains:read", why: "The production domain, used for the project's Domain link." },
    ],
    dataStored: "The latest 50 deployments per linked project and its production domain. The access token is encrypted; Flotilla only sends read requests with it (Vercel tokens can't be limited to read-only).",
    sync: "On connect and link, whenever someone opens the project (if older than 2 minutes), on Sync now, on every scheduler run, and instantly with the optional webhook.",
    envVars: [],
    state: "available",
  },
  { id: "stripe", name: "Stripe", category: "Payments", description: "MRR, subscriptions, refunds and churn.", purpose: "Replace manual revenue entries with synced data.", scopes: [], dataStored: "", sync: "", envVars: [], state: "planned" },
  { id: "posthog", name: "PostHog", category: "Analytics", description: "Signups, activation and retention events.", purpose: "Product analytics (signups, activation, retention) per project.", scopes: [], dataStored: "", sync: "", envVars: [], state: "planned" },
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

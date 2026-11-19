import { providerFetch } from "../core/http";

/**
 * Google Analytics 4 adapter (OAuth lives in ./google-oauth). Read-only.
 * - Admin API v1beta accountSummaries.list → the GA4 properties the account can see
 *   (https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
 * - Data API v1beta properties.runReport → aggregated metrics
 *   (https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport)
 * "keyEvents" is GA4's current name for conversions. Recent days may still be processing.
 */
const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";
export const GA4_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/analytics.readonly"];

export type Ga4Property = { property: string; displayName: string; account: string; accountName: string };

export async function listProperties(accessToken: string) {
  const out: Ga4Property[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) });
    const r = await providerFetch<{
      accountSummaries?: { account: string; displayName: string; propertySummaries?: { property: string; displayName: string }[] }[];
      nextPageToken?: string;
    }>(`${ADMIN}/accountSummaries?${q}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    for (const a of r.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) out.push({ property: p.property, displayName: p.displayName, account: a.account, accountName: a.displayName });
    }
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return out;
}

export const GA4_METRICS = ["sessions", "totalUsers", "newUsers", "screenPageViews", "engagedSessions", "keyEvents"] as const;
export type Ga4Metric = (typeof GA4_METRICS)[number];

type RunReportResponse = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type: string }[];
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
  rowCount?: number;
};

export type Ga4Row = { keys: string[]; values: Record<string, number> };

/** Flattens a runReport response into rows keyed by metric name. Pure; exported for tests. */
export function parseReport(r: RunReportResponse): Ga4Row[] {
  const metricNames = (r.metricHeaders ?? []).map((m) => m.name);
  return (r.rows ?? []).map((row) => ({
    keys: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
    values: Object.fromEntries(metricNames.map((n, i) => {
      const v = Number(row.metricValues?.[i]?.value ?? 0);
      return [n, Number.isFinite(v) ? v : 0];
    })),
  }));
}

/** GA4 returns dates as YYYYMMDD. */
export const ga4Date = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v);

export async function runReport(
  accessToken: string,
  property: string,
  q: { startDate: string; endDate: string; dimensions: string[]; metrics: readonly string[]; limit?: number; orderByMetric?: string },
) {
  const r = await providerFetch<RunReportResponse>(`${DATA}/${property}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: q.startDate, endDate: q.endDate }],
      dimensions: q.dimensions.map((name) => ({ name })),
      metrics: q.metrics.map((name) => ({ name })),
      limit: String(q.limit ?? 1000),
      ...(q.orderByMetric ? { orderBys: [{ metric: { metricName: q.orderByMetric }, desc: true }] } : {}),
      keepEmptyRows: false,
    }),
  });
  return parseReport(r);
}

import { providerFetch } from "../core/http";

/**
 * Google Search Console adapter (OAuth lives in ./google-oauth).
 * Search Console API v3: sites.list and searchAnalytics.query
 * (https://developers.google.com/webmaster-tools/v1/searchanalytics/query). rowLimit max 25,000; ctr is 0..1;
 * data typically lands after 2–3 days.
 */
const API = "https://www.googleapis.com/webmasters/v3";
export const GSC_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/webmasters.readonly"];

export type GscSite = { siteUrl: string; permissionLevel: string };

export async function listSites(accessToken: string) {
  const r = await providerFetch<{ siteEntry?: GscSite[] }>(`${API}/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return (r.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
}

export type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

export async function searchAnalytics(
  accessToken: string,
  siteUrl: string,
  q: { startDate: string; endDate: string; dimensions: string[]; rowLimit?: number },
) {
  const r = await providerFetch<{ rows?: GscRow[] }>(`${API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...q, rowLimit: q.rowLimit ?? 1000, type: "web" }),
  });
  return r.rows ?? [];
}

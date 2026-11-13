import { createHash, randomBytes } from "node:crypto";
import { ProviderError, providerFetch } from "../core/http";

/**
 * Google Search Console adapter.
 * OAuth 2.0 web-server flow (https://developers.google.com/identity/protocols/oauth2/web-server) plus PKCE
 * as defence in depth (accepted by Google for web clients, though only documented for installed apps).
 * Search Console API v3: sites.list and searchAnalytics.query
 * (https://developers.google.com/webmaster-tools/v1/searchanalytics/query). rowLimit max 25,000; ctr is 0..1;
 * data typically lands after 2–3 days.
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/webmasters/v3";
export const GSC_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/webmasters.readonly"];

export function redirectUri() {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/integrations/google_search_console/callback`;
}

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizationUrl(state: string, codeChallenge: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GSC_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope: string; id_token?: string };

export async function exchangeCode(code: string, verifier: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const t = await providerFetch<TokenResponse>(TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 1);
  return { ...t, email: emailFromIdToken(t.id_token) };
}

export async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
  try {
    return await providerFetch<TokenResponse>(TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 2);
  } catch (e) {
    // invalid_grant = revoked or expired consent: the user must reconnect.
    if (e instanceof ProviderError && (e.kind === "bad_request" || e.kind === "auth")) throw new ProviderError("auth", "Google access was revoked or expired. Reconnect to continue.");
    throw e;
  }
}

export async function revokeToken(token: string) {
  try {
    // Per Google's web-server OAuth docs: POST with the token in a form-encoded body.
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    /* best effort; local tokens are deleted regardless */
  }
}

/** The id_token comes straight from Google's token endpoint over TLS, so reading its payload is safe here. */
function emailFromIdToken(idToken?: string) {
  if (!idToken) return "";
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? "";
  } catch {
    return "";
  }
}

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

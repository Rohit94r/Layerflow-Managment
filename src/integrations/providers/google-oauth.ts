import { createHash, randomBytes } from "node:crypto";
import { ProviderError, providerFetch } from "../core/http";
import { publicOrigin } from "../../lib/origin";

/**
 * Google OAuth 2.0 web-server flow shared by every Google provider
 * (https://developers.google.com/identity/protocols/oauth2/web-server), plus PKCE as defence in depth.
 * One Google Cloud OAuth client serves all providers; each provider has its own redirect URI.
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export function redirectUri(provider: string) {
  return `${publicOrigin()}/api/integrations/${provider}/callback`;
}

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizationUrl(provider: string, scopes: string[], state: string, codeChallenge: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: scopes.join(" "),
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

export async function exchangeCode(provider: string, code: string, verifier: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri(provider),
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
    await fetch(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
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

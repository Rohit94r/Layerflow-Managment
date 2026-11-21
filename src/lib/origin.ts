/**
 * The app's public origin (scheme + host, no trailing slash). One source for sign-in, OAuth redirect URIs,
 * invitation links and hosted-blog URLs.
 *
 * Order: BETTER_AUTH_URL (explicit, recommended) → Vercel's production domain → this deployment's Vercel URL → localhost.
 * VERCEL_PROJECT_PRODUCTION_URL and VERCEL_URL are system variables Vercel sets on every deployment (host only).
 */
export function publicOrigin() {
  const explicit = process.env.BETTER_AUTH_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
  const host = prod || process.env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

/** Every origin this deployment can be reached on (custom domain, production alias, branch and deployment URLs). */
export function trustedOrigins() {
  const hosts = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL].filter(Boolean);
  // `pnpm dev` moves to 3001, 3002… when 3000 is busy: allow signing in on whichever local port it picked.
  const local = process.env.NODE_ENV === "development"
    ? Array.from({ length: 11 }, (_, i) => 3000 + i).flatMap((port) => [`http://localhost:${port}`, `http://127.0.0.1:${port}`])
    : [];
  return [...new Set([publicOrigin(), ...hosts.map((h) => `https://${h}`), ...local])];
}

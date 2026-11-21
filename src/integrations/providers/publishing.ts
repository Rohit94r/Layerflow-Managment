import { createHmac, timingSafeEqual } from "node:crypto";
import { safePostJson } from "../../server/safe-fetch";

/**
 * Outbound publishing adapters.
 *
 * Webhook: POST JSON to the product's own site. Signed like Stripe/GitHub webhooks:
 *   X-Flotilla-Timestamp: <unix seconds>
 *   X-Flotilla-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 * The receiver should reject timestamps older than 5 minutes and compare signatures in constant time.
 * A 2xx response counts as delivered; if the JSON response has { "url": "https://…" } it is stored as the live URL.
 *
 * IndexNow (https://www.indexnow.org/documentation): notifies participating engines (Bing, Yandex, Seznam,
 * Naver and others) that URLs changed. Google does not participate; Google discovers posts via sitemap and links.
 */
export function signWebhook(secret: string, timestamp: number, rawBody: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

/** Reference verifier (also used in tests and shown to users as the receiving-side recipe). */
export function verifyWebhook(secret: string, timestamp: string, rawBody: string, signature: string, nowSec = Math.floor(Date.now() / 1000)) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  const expected = Buffer.from(signWebhook(secret, ts, rawBody));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export type WebhookPost = {
  id: string; title: string; slug: string; excerpt: string; bodyMarkdown: string; metaTitle: string; metaDescription: string;
  canonicalUrl: string | null; coverImageUrl: string | null; tags: string[]; targetKeyword: string; author: string; publishedAt: string;
  product: { name: string; slug: string };
};

export async function deliverWebhook(url: string, secret: string, event: "content.published" | "content.unpublished", post: WebhookPost) {
  const raw = JSON.stringify({ event, sentAt: new Date().toISOString(), post });
  const ts = Math.floor(Date.now() / 1000);
  const res = await safePostJson(url, raw, {
    headers: { "X-Flotilla-Event": event, "X-Flotilla-Timestamp": String(ts), "X-Flotilla-Signature": signWebhook(secret, ts, raw), "X-Flotilla-Delivery": `${post.id}:${ts}` },
  });
  let liveUrl: string | null = null;
  try {
    const j = JSON.parse(res.body) as { url?: unknown };
    if (typeof j.url === "string" && /^https:\/\//.test(j.url)) liveUrl = j.url.slice(0, 2000);
  } catch {
    /* non-JSON response is fine */
  }
  return { ok: res.ok, status: res.status, liveUrl, preview: res.ok ? "" : res.body.slice(0, 300) };
}

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** IndexNow keys: 8–128 characters of a–z, A–Z, 0–9 and '-'. */
export const isValidIndexNowKey = (k: string) => /^[a-zA-Z0-9-]{8,128}$/.test(k);

export async function pingIndexNow(urls: string[], key: string, keyLocation: string) {
  const first = new URL(urls[0]!);
  const res = await safePostJson(INDEXNOW_ENDPOINT, { host: first.host, key, keyLocation, urlList: urls.slice(0, 10000) }, { timeoutMs: 10000 });
  // 200 OK and 202 Accepted are success; 403 = key not valid at keyLocation; 422 = URLs don't match host/key.
  const meaning: Record<number, string> = {
    200: "Submitted.", 202: "Accepted; the key is being validated.", 400: "Bad request.", 403: "Key not found at the key location.",
    422: "URLs don't belong to the key's host.", 429: "Too many requests; try later.",
  };
  return { ok: res.status === 200 || res.status === 202, status: res.status, detail: meaning[res.status] ?? `HTTP ${res.status}` };
}

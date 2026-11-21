import { lookup } from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

/**
 * Fetching user-supplied URLs (crawler, uptime) is an SSRF risk. This guard:
 * - allows only http(s) on ports 80/443,
 * - resolves DNS and refuses private, loopback, link-local and metadata addresses,
 * - follows redirects manually (max 5), re-validating every hop,
 * - enforces a timeout and a response-size cap.
 * Residual risk: DNS can change between the check and the connection (rebinding); acceptable for
 * read-only GETs with no credentials, and noted in BUILD.md.
 */
export class BlockedUrlError extends Error {}

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Not a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new BlockedUrlError("Only http and https URLs are allowed.");
  if (url.port && !["80", "443"].includes(url.port)) throw new BlockedUrlError("Only ports 80 and 443 are allowed.");
  if (url.username || url.password) throw new BlockedUrlError("URLs with credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new BlockedUrlError("Private hosts are not allowed.");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new BlockedUrlError("The domain does not resolve.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new BlockedUrlError("The domain resolves to a private address.");
  return url;
}

export type SafeResponse = { url: string; status: number; headers: Headers; body: string; ms: number; redirects: string[] };

export async function safeGet(raw: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<SafeResponse> {
  const started = Date.now();
  const redirects: string[] = [];
  let current = raw;
  for (let hop = 0; hop <= 5; hop++) {
    const url = await assertPublicUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": "Flotilla-Auditor/1.0 (+site audit requested by the site owner)", Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, url).toString();
        redirects.push(current);
        continue;
      }
      const body = await readCapped(res, opts.maxBytes ?? 2_000_000);
      return { url: url.toString(), status: res.status, headers: res.headers, body, ms: Date.now() - started, redirects };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new BlockedUrlError("Too many redirects.");
}

async function readCapped(res: Response, max: number) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Reads the TLS certificate expiry for an https host (after the same public-address check). */
export async function certificateExpiry(raw: string): Promise<Date | null> {
  const url = await assertPublicUrl(raw);
  if (url.protocol !== "https:") return null;
  return new Promise((resolve) => {
    const socket = tls.connect({ host: url.hostname, port: 443, servername: url.hostname, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert?.valid_to ? new Date(cert.valid_to) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

/**
 * POST JSON to a user-configured URL (publishing webhooks). Same public-address guard as safeGet;
 * redirects are not followed (a webhook must answer at the configured URL).
 */
export async function safePostJson(raw: string, body: unknown, opts: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number } = {}) {
  const url = await assertPublicUrl(raw);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "User-Agent": "Flotilla-Publisher/1.0", ...opts.headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await readCapped(res, opts.maxBytes ?? 200_000);
    return { status: res.status, ok: res.status >= 200 && res.status < 300, body: text, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** Errors normalised across providers so the UI can show a meaningful state. */
export class ProviderError extends Error {
  constructor(
    public kind: "auth" | "rate_limited" | "not_found" | "forbidden" | "unavailable" | "bad_request",
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * JSON request to a provider with timeout, and retry with exponential backoff on 429/5xx.
 * Response bodies are never logged (they may contain user data).
 */
export async function providerFetch<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.ok) return (await res.json()) as T;
      const text = await res.text().catch(() => "");
      const msg = extractMessage(text) || res.statusText;
      if (res.status === 401) throw new ProviderError("auth", msg, 401);
      if (res.status === 403) throw new ProviderError("forbidden", msg, 403);
      if (res.status === 404) throw new ProviderError("not_found", msg, 404);
      if (res.status === 400) throw new ProviderError("bad_request", msg, 400);
      lastErr = new ProviderError(res.status === 429 ? "rate_limited" : "unavailable", msg, res.status);
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** i);
    } catch (e) {
      if (e instanceof ProviderError && !["rate_limited", "unavailable"].includes(e.kind)) throw e;
      lastErr = e instanceof ProviderError ? e : new ProviderError("unavailable", e instanceof Error ? e.message : "Network error");
      await sleep(500 * 2 ** i);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function extractMessage(body: string) {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; error_description?: string };
    if (typeof j.error === "object" && j.error?.message) return j.error.message;
    return j.error_description ?? (typeof j.error === "string" ? j.error : "");
  } catch {
    return body.slice(0, 200);
  }
}

import { BlockedUrlError, safeGet } from "../../server/safe-fetch";
import type { AuditIssue, AuditPage } from "./schema";

/**
 * A small, polite technical crawler: same-origin only, robots.txt respected, sequential
 * requests with a delay, page cap. Produces crawler observations — not Google indexing facts.
 */
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];

function metaContent(html: string, key: string, by: "name" | "property" = "name") {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    if ((attr(m[0], by) ?? "").toLowerCase() === key) return attr(m[0], "content") ?? "";
  }
  return undefined;
}

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

export function analyzeHtml(url: string, html: string) {
  const head = html.slice(0, 200_000);
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const canonicalTag = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => (attr(t, "rel") ?? "").toLowerCase() === "canonical");
  const robots = (metaContent(head, "robots") ?? "").toLowerCase();
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)/gi)].map((m) => m[1]!).filter((h) => !/^(mailto|tel|javascript):/i.test(h));
  return {
    title: title ? decode(title) : undefined,
    description: metaContent(head, "description"),
    canonical: canonicalTag ? attr(canonicalTag, "href") : undefined,
    h1Count: (html.match(/<h1\b/gi) ?? []).length,
    noindex: robots.includes("noindex"),
    lang: html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)/i)?.[1],
    hasOg: Boolean(metaContent(head, "og:title", "property")),
    hasStructuredData: /<script[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(html),
    imagesMissingAlt: imgs.filter((t) => !/\balt\s*=/i.test(t)).length,
    links: links.map((h) => {
      try {
        return new URL(h, url).toString().split("#")[0]!;
      } catch {
        return null;
      }
    }).filter((x): x is string => Boolean(x)),
  };
}

function parseRobots(txt: string) {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  let applies = false;
  for (const line of txt.split(/\r?\n/)) {
    const [k, ...rest] = line.split(":");
    const key = k?.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") applies = val === "*" || val.toLowerCase().includes("flotilla");
    else if (key === "disallow" && applies && val) disallow.push(val);
    else if (key === "sitemap" && val) sitemaps.push(val);
  }
  return { disallow, sitemaps };
}

export async function crawl(startUrl: string, maxPages = 25) {
  const start = new URL(startUrl);
  const origin = start.origin;
  const issues: AuditIssue[] = [];
  const pages: AuditPage[] = [];
  const add = (severity: AuditIssue["severity"], code: string, message: string, url: string) => issues.push({ severity, code, message, url });

  // Site-level checks.
  let robots = { disallow: [] as string[], sitemaps: [] as string[] };
  let robotsTxt = false;
  try {
    const r = await safeGet(`${origin}/robots.txt`, { maxBytes: 200_000 });
    if (r.status === 200) {
      robotsTxt = true;
      robots = parseRobots(r.body);
    }
  } catch {
    /* treated as missing */
  }
  if (!robotsTxt) add("notice", "robots_missing", "No robots.txt found.", `${origin}/robots.txt`);
  let sitemap: string | null = robots.sitemaps[0] ?? null;
  if (!sitemap) {
    try {
      const s = await safeGet(`${origin}/sitemap.xml`, { maxBytes: 500_000 });
      if (s.status === 200 && /<(urlset|sitemapindex)/i.test(s.body)) sitemap = `${origin}/sitemap.xml`;
    } catch {
      /* missing */
    }
  }
  if (!sitemap) add("warning", "sitemap_missing", "No XML sitemap found (checked robots.txt and /sitemap.xml).", origin);

  const allowed = (u: string) => {
    const path = new URL(u).pathname;
    return !robots.disallow.some((d) => path.startsWith(d));
  };

  const queue = [start.toString()];
  const seen = new Set(queue);
  let hsts = false;
  const titles = new Map<string, string[]>();
  while (queue.length && pages.length < maxPages) {
    const url = queue.shift()!;
    if (!allowed(url)) {
      add("notice", "robots_blocked", "Skipped: disallowed by robots.txt.", url);
      continue;
    }
    try {
      const res = await safeGet(url);
      if (pages.length === 0) hsts = Boolean(res.headers.get("strict-transport-security"));
      const isHtml = (res.headers.get("content-type") ?? "").includes("html");
      const page: AuditPage = { url, status: res.status, ms: res.ms, bytes: res.body.length, redirectedTo: res.redirects.at(-1) };
      if (res.status >= 400) add("error", "http_error", `Returns HTTP ${res.status}.`, url);
      if (res.redirects.length > 1) add("warning", "redirect_chain", `Redirect chain of ${res.redirects.length} hops.`, url);
      if (res.ms > 3000) add("warning", "slow", `Slow response (${(res.ms / 1000).toFixed(1)}s).`, url);
      if (isHtml && res.status < 400) {
        const a = analyzeHtml(res.url, res.body);
        Object.assign(page, { title: a.title, description: a.description, canonical: a.canonical, h1Count: a.h1Count, noindex: a.noindex, lang: a.lang, hasOg: a.hasOg, hasStructuredData: a.hasStructuredData, imagesMissingAlt: a.imagesMissingAlt });
        if (!a.title) add("error", "title_missing", "Missing <title>.", url);
        else {
          if (a.title.length > 60) add("notice", "title_long", `Title is ${a.title.length} characters (may be truncated).`, url);
          titles.set(a.title, [...(titles.get(a.title) ?? []), url]);
        }
        if (!a.description) add("warning", "description_missing", "Missing meta description.", url);
        else if (a.description.length > 160) add("notice", "description_long", `Meta description is ${a.description.length} characters.`, url);
        if (a.h1Count === 0) add("warning", "h1_missing", "No <h1> heading.", url);
        if (a.h1Count > 1) add("notice", "h1_multiple", `${a.h1Count} <h1> headings.`, url);
        if (!a.canonical) add("notice", "canonical_missing", "No canonical link.", url);
        if (a.noindex) add("warning", "noindex", "Page has a noindex robots meta tag.", url);
        if (!a.lang) add("notice", "lang_missing", "No lang attribute on <html>.", url);
        if (!a.hasOg) add("notice", "og_missing", "No Open Graph title (social previews).", url);
        if (a.imagesMissingAlt) add("notice", "img_alt", `${a.imagesMissingAlt} image(s) without alt text.`, url);
        for (const l of a.links) {
          if (l.startsWith(origin) && !seen.has(l) && !/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|css|js)$/i.test(l)) {
            seen.add(l);
            queue.push(l);
          }
        }
      }
      pages.push(page);
    } catch (e) {
      const msg = e instanceof BlockedUrlError ? e.message : e instanceof Error && e.name === "AbortError" ? "Timed out" : "Could not fetch";
      pages.push({ url, status: null, ms: null, error: msg });
      add("error", "fetch_failed", msg, url);
    }
    await new Promise((r) => setTimeout(r, 250)); // polite crawl rate
  }
  for (const [title, urls] of titles) if (urls.length > 1) add("warning", "title_duplicate", `Title “${title.slice(0, 60)}” used on ${urls.length} pages.`, urls[0]!);
  if (start.protocol !== "https:") add("error", "no_https", "Site is not served over HTTPS.", origin);
  else if (!hsts) add("notice", "hsts_missing", "No Strict-Transport-Security header.", origin);

  return { pages, issues, site: { robotsTxt, sitemap, https: start.protocol === "https:", hsts } };
}

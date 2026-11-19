import type { PublicBlog } from "./service";

/** Pure feed builders for the hosted blog (RSS 2.0, XML sitemap, JSON Feed 1.1). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const postUrl = (base: string, p: PublicBlog["posts"][number]) => p.canonicalUrl ?? `${base}/${p.slug}`;

export function rss(blog: PublicBlog, base: string) {
  const items = blog.posts.map((p) => [
    "<item>",
    `<title>${esc(p.title)}</title>`,
    `<link>${esc(postUrl(base, p))}</link>`,
    `<guid isPermaLink="false">${esc(p.id)}</guid>`,
    p.publishedAt ? `<pubDate>${p.publishedAt.toUTCString()}</pubDate>` : "",
    `<description>${esc(p.excerpt || p.metaDescription || "")}</description>`,
    ...p.tags.map((t) => `<category>${esc(t)}</category>`),
    "</item>",
  ].filter(Boolean).join(""));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(blog.title)}</title><link>${esc(base)}</link><description>${esc(blog.description || blog.title)}</description><atom:link href="${esc(`${base}/rss.xml`)}" rel="self" type="application/rss+xml"/>${blog.posts[0]?.publishedAt ? `<lastBuildDate>${blog.posts[0].publishedAt.toUTCString()}</lastBuildDate>` : ""}${items.join("")}</channel></rss>`;
}

export function sitemap(blog: PublicBlog, base: string) {
  // Posts with an external canonical belong to that site's sitemap, not this one.
  const urls = [
    `<url><loc>${esc(base)}</loc>${blog.posts[0] ? `<lastmod>${blog.posts[0].updatedAt.toISOString()}</lastmod>` : ""}</url>`,
    ...blog.posts.filter((p) => !p.canonicalUrl).map((p) => `<url><loc>${esc(`${base}/${p.slug}`)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
}

export function jsonFeed(blog: PublicBlog, base: string) {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: blog.title,
    home_page_url: base,
    feed_url: `${base}/feed.json`,
    description: blog.description || undefined,
    items: blog.posts.map((p) => ({
      id: p.id, url: postUrl(base, p), title: p.title, summary: p.excerpt || p.metaDescription || undefined,
      date_published: p.publishedAt?.toISOString(), date_modified: p.updatedAt.toISOString(), tags: p.tags.length ? p.tags : undefined,
      image: p.coverImageUrl ?? undefined, authors: p.authorName ? [{ name: p.authorName }] : undefined,
    })),
  };
}

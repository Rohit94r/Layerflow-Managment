import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDb } from "@/server/db";
import { appOrigin, hostedBlogPath, publicBlog } from "@/modules/content/service";
import { JsonLd, PublicBlogShell } from "@/components/public-blog";
import { formatDate } from "@/lib/format";

type P = { params: Promise<{ ws: string; product: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { ws, product } = await params;
  await ensureDb();
  const blog = await publicBlog(ws, product, 1);
  if (!blog) return { title: "Not found", robots: { index: false } };
  const url = `${appOrigin()}${hostedBlogPath(ws, product)}`;
  return {
    title: { absolute: blog.title },
    description: blog.description || undefined,
    alternates: { canonical: url, types: { "application/rss+xml": `${url}/rss.xml`, "application/feed+json": `${url}/feed.json` } },
    openGraph: { type: "website", url, title: blog.title, description: blog.description || undefined, siteName: blog.product.name },
    twitter: { card: "summary", title: blog.title, description: blog.description || undefined },
  };
}

export default async function BlogIndex({ params }: P) {
  const { ws, product } = await params;
  await ensureDb();
  const blog = await publicBlog(ws, product);
  if (!blog) notFound();
  const base = hostedBlogPath(ws, product);
  const url = `${appOrigin()}${base}`;

  return (
    <PublicBlogShell blog={blog}>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Blog", name: blog.title, description: blog.description, url,
        blogPost: blog.posts.slice(0, 20).map((p) => ({ "@type": "BlogPosting", headline: p.title, url: p.canonicalUrl ?? `${url}/${p.slug}`, datePublished: p.publishedAt?.toISOString() })),
      }} />
      <h1 className="text-[2.2rem] leading-tight sm:text-[2.6rem]">{blog.title}</h1>
      {blog.description && <p className="mt-2 max-w-2xl text-[16px] text-ink-2">{blog.description}</p>}
      {blog.posts.length ? (
        <ol className="mt-10 divide-y divide-line border-t border-line">
          {blog.posts.map((p) => (
            <li key={p.id} className="py-6">
              <article>
                <div className="text-[12.5px] text-muted">
                  <time dateTime={p.publishedAt?.toISOString()}>{formatDate(p.publishedAt, { month: "long", day: "numeric", year: "numeric" })}</time>
                  {" · "}{Math.max(1, Math.round(p.wordCount / 230))} min read
                </div>
                <h2 className="mt-1 text-[1.45rem] leading-snug">
                  <Link href={`${base}/${p.slug}`} className="hover:underline hover:decoration-[var(--brand)] hover:underline-offset-4">{p.title}</Link>
                </h2>
                {(p.excerpt || p.metaDescription) && <p className="mt-1.5 text-ink-2">{p.excerpt || p.metaDescription}</p>}
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-10 text-ink-2">No posts yet. Check back soon.</p>
      )}
    </PublicBlogShell>
  );
}

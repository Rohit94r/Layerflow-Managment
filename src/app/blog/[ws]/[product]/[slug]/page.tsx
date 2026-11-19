import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDb } from "@/server/db";
import { appOrigin, hostedBlogPath, publicPost } from "@/modules/content/service";
import { JsonLd, PublicBlogShell } from "@/components/public-blog";
import { Markdown } from "@/components/markdown";
import { formatDate } from "@/lib/format";

type P = { params: Promise<{ ws: string; product: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { ws, product, slug } = await params;
  await ensureDb();
  const r = await publicPost(ws, product, slug);
  if (!r) return { title: "Not found", robots: { index: false } };
  const { post, blog } = r;
  const url = post.canonicalUrl ?? `${appOrigin()}${hostedBlogPath(ws, product)}/${post.slug}`;
  const description = post.metaDescription || post.excerpt || undefined;
  return {
    title: { absolute: post.metaTitle || post.title },
    description,
    keywords: [post.targetKeyword, ...post.secondaryKeywords].filter(Boolean),
    authors: post.authorName ? [{ name: post.authorName }] : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article", url, title: post.metaTitle || post.title, description, siteName: blog.product.name,
      publishedTime: post.publishedAt?.toISOString(), modifiedTime: post.updatedAt.toISOString(), tags: post.tags,
      images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : undefined,
    },
    twitter: { card: post.coverImageUrl ? "summary_large_image" : "summary", title: post.metaTitle || post.title, description, images: post.coverImageUrl ? [post.coverImageUrl] : undefined },
  };
}

export default async function BlogPost({ params }: P) {
  const { ws, product, slug } = await params;
  await ensureDb();
  const r = await publicPost(ws, product, slug);
  if (!r) notFound();
  const { post, blog, related } = r;
  const base = hostedBlogPath(ws, product);
  const url = post.canonicalUrl ?? `${appOrigin()}${base}/${post.slug}`;
  const minutes = Math.max(1, Math.round(post.wordCount / 230));

  return (
    <PublicBlogShell blog={blog}>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: post.metaDescription || post.excerpt,
        datePublished: post.publishedAt?.toISOString(), dateModified: post.updatedAt.toISOString(), mainEntityOfPage: url, url,
        keywords: [post.targetKeyword, ...post.secondaryKeywords].filter(Boolean).join(", "), wordCount: post.wordCount,
        ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
        ...(post.authorName ? { author: { "@type": "Person", name: post.authorName } } : {}),
        publisher: { "@type": "Organization", name: blog.product.name },
      }} />
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: blog.title, item: `${appOrigin()}${base}` },
          { "@type": "ListItem", position: 2, name: post.title, item: url },
        ],
      }} />
      <nav className="mb-6 text-[13px] text-muted" aria-label="Breadcrumb">
        <Link href={base} className="hover:text-ink">← {blog.title}</Link>
      </nav>
      <article>
        <header className="mb-8">
          <h1 className="text-[2rem] leading-tight sm:text-[2.6rem]">{post.title}</h1>
          <div className="mt-3 text-[13px] text-muted">
            {post.authorName && <>{post.authorName} · </>}
            <time dateTime={post.publishedAt?.toISOString()}>{formatDate(post.publishedAt, { month: "long", day: "numeric", year: "numeric" })}</time>
            {" · "}{minutes} min read
          </div>
          {post.coverImageUrl && /^https:\/\//.test(post.coverImageUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.coverImageUrl} alt="" className="mt-6 h-auto w-full rounded-xl" referrerPolicy="no-referrer" />
          )}
        </header>
        <div className="text-[16.5px] [&_.prose-doc]:text-[16.5px] [&_.prose-doc_a]:decoration-[var(--brand)]">
          <Markdown source={post.body} mode="public" />
        </div>
        {post.tags.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-1.5">
            {post.tags.map((t) => <li key={t} className="rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-2">#{t}</li>)}
          </ul>
        )}
      </article>
      {related.length > 0 && (
        <aside className="mt-14 border-t border-line pt-8">
          <h2 className="text-xl">Keep reading</h2>
          <ul className="mt-4 space-y-4">
            {related.map((p) => (
              <li key={p.id}>
                <Link href={`${base}/${p.slug}`} className="font-serif text-[1.15rem] hover:underline">{p.title}</Link>
                {p.excerpt && <p className="text-[14px] text-ink-2">{p.excerpt}</p>}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </PublicBlogShell>
  );
}

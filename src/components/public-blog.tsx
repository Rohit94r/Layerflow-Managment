import Link from "next/link";
import { Rss } from "lucide-react";
import type { PublicBlog } from "@/modules/content/service";
import { APP_NAME } from "@/lib/brand";

/** Reading-first shell for a product's public blog. Uses the app's tokens, accented by the product's colour. */
export function PublicBlogShell({ blog, children }: { blog: PublicBlog; children: React.ReactNode }) {
  const home = `/blog/${blog.workspaceSlug}/${blog.product.slug}`;
  return (
    <div className="min-h-dvh bg-bg" style={{ ["--brand" as string]: blog.product.brandColor }}>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link href={home} className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md font-serif text-white" style={{ background: "var(--brand)" }} aria-hidden>
              {blog.product.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate font-serif text-lg">{blog.title}</span>
          </Link>
          <a href={`${home}/rss.xml`} className="ml-auto flex items-center gap-1 text-[13px] text-muted hover:text-ink" aria-label="RSS feed">
            <Rss className="size-4" /> <span className="hidden sm:inline">RSS</span>
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-6 text-[12px] text-muted sm:px-6">
          © {new Date().getFullYear()} {blog.product.name} · Published with {APP_NAME}
        </div>
      </footer>
    </div>
  );
}

/** Serialises JSON-LD safely inside a <script> tag. */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

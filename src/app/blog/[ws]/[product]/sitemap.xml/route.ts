import { ensureDb } from "@/server/db";
import { appOrigin, hostedBlogPath, publicBlog } from "@/modules/content/service";
import { sitemap } from "@/modules/content/feeds";

// Per-tenant data from the database: never prerender (the sitemap.xml folder name would otherwise trigger static generation).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ws: string; product: string }> }) {
  const { ws, product } = await params;
  await ensureDb();
  const blog = await publicBlog(ws, product, 5000);
  if (!blog) return new Response("Not found", { status: 404 });
  return new Response(sitemap(blog, `${appOrigin()}${hostedBlogPath(ws, product)}`), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

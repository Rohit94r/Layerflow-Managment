import { ensureDb } from "@/server/db";
import { appOrigin, hostedBlogPath, publicBlog } from "@/modules/content/service";
import { rss } from "@/modules/content/feeds";

// Per-tenant data from the database: never prerender.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ws: string; product: string }> }) {
  const { ws, product } = await params;
  await ensureDb();
  const blog = await publicBlog(ws, product, 50);
  if (!blog) return new Response("Not found", { status: 404 });
  return new Response(rss(blog, `${appOrigin()}${hostedBlogPath(ws, product)}`), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

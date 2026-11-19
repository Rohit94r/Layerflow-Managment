import { ensureDb } from "@/server/db";
import { appOrigin, hostedBlogPath, publicBlog } from "@/modules/content/service";
import { jsonFeed } from "@/modules/content/feeds";

/** JSON Feed 1.1: also lets your own sites pull published posts without a webhook. */
// Per-tenant data from the database: never prerender.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ws: string; product: string }> }) {
  const { ws, product } = await params;
  await ensureDb();
  const blog = await publicBlog(ws, product, 100);
  if (!blog) return new Response("Not found", { status: 404 });
  return Response.json(jsonFeed(blog, `${appOrigin()}${hostedBlogPath(ws, product)}`), {
    headers: { "Content-Type": "application/feed+json; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}

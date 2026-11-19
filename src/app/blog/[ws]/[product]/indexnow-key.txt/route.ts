import { ensureDb } from "@/server/db";
import { publicBlog } from "@/modules/content/service";

/** IndexNow key file. Its location scopes the key to URLs under this blog path. */
// Per-tenant data from the database: never prerender.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ws: string; product: string }> }) {
  const { ws, product } = await params;
  await ensureDb();
  const blog = await publicBlog(ws, product, 1);
  if (!blog?.indexNowKey) return new Response("Not found", { status: 404 });
  return new Response(blog.indexNowKey, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

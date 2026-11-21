import Link from "next/link";
import { Bot, Plus } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { productOptions } from "@/modules/portfolio/service";
import { contentStats, listPosts } from "@/modules/content/service";
import { POST_STATUSES, postLabel, type PostStatus } from "@/modules/content/constants";
import { ContentCalendar, PostList } from "@/components/content-views";
import { EmptyState, NoAccess, PageHeader, Panel } from "@/components/ui";
import { cn } from "@/lib/format";

export const metadata = { title: "Content" };

export default async function ContentPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/content">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "content.view")) return <NoAccess what="content" />;
  const base = `/w/${ctx.workspaceSlug}`;
  const products = await productOptions(ctx);
  const productSlug = typeof sp.product === "string" ? sp.product : "";
  const prod = products.find((p) => p.slug === productSlug);
  const status = typeof sp.status === "string" && (POST_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as PostStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const [posts, stats] = await Promise.all([listPosts(ctx, { productId: prod?.id, status: status ?? "active", q }), contentStats(ctx)]);

  const totals = [...stats.entries()].filter(([pid]) => !prod || pid === prod.id).reduce(
    (s, [, v]) => ({ ideas: s.ideas + v.ideas, drafts: s.drafts + v.drafts, inReview: s.inReview + v.inReview, scheduled: s.scheduled + v.scheduled, published30d: s.published30d + v.published30d }),
    { ideas: 0, drafts: 0, inReview: 0, scheduled: 0, published30d: 0 },
  );
  const href = (o: { status?: string; product?: string }) => {
    const u = new URLSearchParams();
    const s = o.status ?? status;
    const pr = o.product ?? productSlug;
    if (s) u.set("status", s);
    if (pr) u.set("product", pr);
    return `${base}/content${u.size ? `?${u}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Content"
        description="Plan, write, review and publish blog posts for every project. Agents can draft; your publishing policy decides what goes live."
        actions={
          <>
            {can(ctx, "agent.view") && <Link href={`${base}/agents`} className="btn btn-secondary"><Bot className="size-4" /> Content agents</Link>}
            {can(ctx, "content.edit") && <Link href={`${base}/content/new${prod ? `?product=${prod.slug}` : ""}`} className="btn btn-primary"><Plus className="size-4" /> New post</Link>}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
        {([
          ["idea", "Ideas", totals.ideas], ["draft", "Drafts", totals.drafts], ["in_review", "In review", totals.inReview],
          ["scheduled", "Scheduled", totals.scheduled], ["published", "Published · 30d", totals.published30d],
        ] as const).map(([s, l, n]) => (
          <Link key={s} href={href({ status: s })} className={cn("bg-surface px-4 py-3 hover:bg-sunken", status === s && "bg-cobalt-soft", s === "published" && "col-span-2 sm:col-span-1")}>
            <div className="eyebrow">{l}</div>
            <div className="mt-1 font-serif text-2xl tabular-nums">{n}</div>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="-mx-4 flex w-[calc(100%+2rem)] min-w-0 gap-1 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-1 sm:px-0" aria-label="Status">
          <Link href={href({ status: "" })} className={cn("shrink-0 rounded-md px-2.5 py-1 text-[13px]", !status ? "bg-ink text-bg" : "text-ink-2 hover:bg-sunken")}>All active</Link>
          {POST_STATUSES.map((s) => (
            <Link key={s} href={href({ status: s })} className={cn("shrink-0 rounded-md px-2.5 py-1 text-[13px]", status === s ? "bg-ink text-bg" : "text-ink-2 hover:bg-sunken")}>{postLabel(s)}</Link>
          ))}
        </nav>
        <form className="flex w-full gap-2 sm:w-auto" action={`${base}/content`}>
          {status && <input type="hidden" name="status" value={status} />}
          <select name="product" defaultValue={productSlug} className="input w-auto min-w-0 flex-1 sm:w-48 sm:flex-none" aria-label="Product">
            <option value="">All projects</option>
            {products.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
          </select>
          <input name="q" defaultValue={q} placeholder="Search titles, keywords" className="input min-w-0 flex-1 sm:w-48" aria-label="Search posts" />
          <button className="btn btn-secondary">Filter</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title={status ? postLabel(status) : "Posts"} action={<span className="text-[12px] text-muted">{posts.length}</span>}>
          <PostList
            slug={ctx.workspaceSlug}
            posts={posts}
            showProduct={!prod}
            empty={
              <EmptyState
                compact
                title={status || q ? "No posts match" : "No posts yet"}
                action={can(ctx, "content.edit") && !status ? <Link href={`${base}/content/new`} className="btn btn-primary">Write the first post</Link> : undefined}
              >
                {status || q ? "Try another filter." : "Start from an SEO opportunity, a question customers ask, or let the Content Writer agent draft one for review."}
              </EmptyState>
            }
          />
        </Panel>
        <ContentCalendar ctx={ctx} productId={prod?.id} />
      </div>
    </>
  );
}

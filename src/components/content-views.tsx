import Link from "next/link";
import { Bot, CalendarClock } from "lucide-react";
import type { Ctx } from "@/server/permissions";
import { calendar, type PostRow } from "@/modules/content/service";
import { STATUS_TONE, postLabel, type PostStatus } from "@/modules/content/constants";
import { Badge, EmptyState, Panel, ProductMark } from "@/components/ui";
import { cn, formatDate, relativeTime, today } from "@/lib/format";

const scoreTone = (s: number) => (s >= 75 ? "text-good" : s >= 50 ? "text-warn" : "text-bad");

function when(p: PostRow) {
  if (p.status === "published" && p.publishedAt) return { label: "Published", at: p.publishedAt };
  if (p.status === "scheduled" && p.scheduledAt) return { label: "Scheduled", at: p.scheduledAt };
  return { label: "Edited", at: p.updatedAt };
}

/** Post list: a table on wide screens, stacked rows on phones. */
export function PostList({ slug, posts, showProduct = true, empty }: { slug: string; posts: PostRow[]; showProduct?: boolean; empty?: React.ReactNode }) {
  if (!posts.length) return <>{empty}</>;
  return (
    <>
      <ul className="divide-y divide-line md:hidden">
        {posts.map((p) => {
          const w = when(p);
          return (
            <li key={p.id}>
              <Link href={`/w/${slug}/content/${p.id}`} className="flex gap-3 px-4 py-3 active:bg-sunken">
                {showProduct && <ProductMark name={p.productName} color={p.brandColor} className="mt-0.5 size-6 text-[11px]" />}
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 font-medium">{p.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                    <Badge tone={STATUS_TONE[p.status as PostStatus]}>{postLabel(p.status)}</Badge>
                    {p.source === "agent" && <Badge tone="cobalt"><Bot className="size-3" /> Agent</Badge>}
                    <span className={cn("font-medium tabular-nums", scoreTone(p.seoScore))}>SEO {p.seoScore}</span>
                    <span>· {w.label.toLowerCase()} {relativeTime(w.at)}</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              {showProduct && <th>Project</th>}
              <th>Status</th>
              <th>Keyword</th>
              <th className="text-right">SEO</th>
              <th className="text-right">Words</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => {
              const w = when(p);
              return (
                <tr key={p.id}>
                  <td className="max-w-[360px]">
                    <Link href={`/w/${slug}/content/${p.id}`} className="font-medium hover:text-cobalt">{p.title}</Link>
                    {p.source === "agent" && <Badge tone="cobalt" className="ml-2"><Bot className="size-3" /> Agent</Badge>}
                  </td>
                  {showProduct && (
                    <td><span className="flex items-center gap-2 whitespace-nowrap"><span className="size-2.5 rounded-[3px]" style={{ background: p.brandColor }} />{p.productName}</span></td>
                  )}
                  <td><Badge tone={STATUS_TONE[p.status as PostStatus]}>{postLabel(p.status)}</Badge></td>
                  <td className="max-w-[180px] truncate text-ink-2">{p.targetKeyword || <span className="text-muted">—</span>}</td>
                  <td className={cn("text-right font-medium tabular-nums", scoreTone(p.seoScore))}>{p.seoScore}</td>
                  <td className="text-right tabular-nums text-ink-2">{p.wordCount.toLocaleString("en-US")}</td>
                  <td className="whitespace-nowrap text-[12.5px] text-muted" title={w.at.toISOString()}>{w.label} {w.label === "Scheduled" ? formatDate(w.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : relativeTime(w.at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Two weeks back, four weeks ahead: what went out and what's queued, by day. */
export async function ContentCalendar({ ctx, productId }: { ctx: Ctx; productId?: string }) {
  const items = await calendar(ctx, productId);
  const byDay = new Map<string, typeof items>();
  for (const i of items) {
    const k = i.at!.toISOString().slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  const now = today();
  return (
    <Panel title="Calendar" action={<span className="text-[12px] text-muted">Past 2 weeks · next 4 weeks</span>}>
      {items.length ? (
        <ol className="divide-y divide-line">
          {[...byDay.entries()].map(([day, list]) => (
            <li key={day} className="flex gap-4 px-4 py-2.5">
              <div className={cn("w-14 shrink-0 text-center", day === now && "text-cobalt")}>
                <div className="eyebrow">{formatDate(day, { weekday: "short" })}</div>
                <div className="font-serif text-xl leading-none">{formatDate(day, { day: "numeric" })}</div>
                <div className="text-[11px] text-muted">{formatDate(day, { month: "short" })}</div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1">
                {list.map((i) => (
                  <li key={i.id}>
                    <Link href={`/w/${ctx.workspaceSlug}/content/${i.id}`} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-sunken">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: i.brandColor }} />
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      {i.status === "scheduled" ? (
                        <span className="flex shrink-0 items-center gap-1 text-[12px] text-cobalt"><CalendarClock className="size-3" />{formatDate(i.at!, { hour: "numeric", minute: "2-digit" })}</span>
                      ) : (
                        <Badge tone="good">Live</Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState compact title="Nothing scheduled">Schedule approved posts to build a steady publishing rhythm. Consistency beats bursts.</EmptyState>
      )}
    </Panel>
  );
}

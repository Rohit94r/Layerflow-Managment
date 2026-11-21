import Link from "next/link";
import type { Ctx } from "@/server/permissions";
import { can } from "@/server/permissions";
import { listGoals, listRoadmap } from "@/modules/planning/service";
import { productOptions } from "@/modules/portfolio/service";
import { AddGoal, AddRoadmapItem, CheckIn } from "@/components/client/planning-forms";
import { DeleteGoal, RoadmapItemControls } from "@/components/client/ops-actions";
import { Badge, EmptyState, Panel } from "@/components/ui";
import { cn, formatDate, relativeTime } from "@/lib/format";

const GOAL_TONE = { on_track: "good", at_risk: "warn", off_track: "bad", achieved: "cobalt", missed: "bad" } as const;
const fmt = (v: number, unit: string) => `${Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1)}${unit ? ` ${unit}` : ""}`;

export async function RoadmapView({ ctx, productId }: { ctx: Ctx; productId?: string }) {
  const [items, goals, products] = await Promise.all([listRoadmap(ctx, productId), listGoals(ctx, productId), productOptions(ctx)]);
  const canEdit = can(ctx, "planning.edit");
  const cols = [["now", "Now"], ["next", "Next"], ["later", "Later"], ["done", "Done"]] as const;

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddRoadmapItem slug={ctx.workspaceSlug} products={products} productId={productId} />
          <AddGoal slug={ctx.workspaceSlug} products={products} productId={productId} />
        </div>
      )}
      <Panel title="Goals" action={<span className="text-[12px] text-muted">Status derived from progress vs time elapsed</span>}>
        {goals.length ? (
          <ul className="divide-y divide-line">
            {goals.map((g) => (
              <li key={g.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{g.title}</span>
                    <Badge tone={GOAL_TONE[g.status]}>{g.status.replace("_", " ")}</Badge>
                    {!productId && <span className="text-[12px] text-muted">{g.productName ?? "All projects"}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(g.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`}>
                      <div className="h-full rounded-full bg-chart" style={{ width: `${Math.round(g.progress * 100)}%` }} />
                    </div>
                    <span className="whitespace-nowrap text-[12.5px] tabular-nums text-ink-2">{fmt(g.currentValue, g.unit)} of {fmt(g.targetValue, g.unit)} · {Math.round(g.progress * 100)}%</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    {g.metric}{g.dueDate ? ` · due ${formatDate(g.dueDate)}` : ""}{g.lastCheckInAt ? ` · checked in ${relativeTime(g.lastCheckInAt)}` : ""}{g.ownerName ? ` · ${g.ownerName}` : ""}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <CheckIn slug={ctx.workspaceSlug} id={g.id} current={g.currentValue} />
                    <DeleteGoal slug={ctx.workspaceSlug} id={g.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="No goals yet">Set a measurable goal with a start, target and due date. Check in as the number changes.</EmptyState>
        )}
      </Panel>

      <div>
        <h2 className="mb-3 text-xl">Roadmap</h2>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-[880px] grid-cols-4 gap-3">
            {cols.map(([key, label]) => {
              const col = items.filter((i) => i.horizon === key);
              return (
                <div key={key} className={cn("rounded-lg border border-line p-2", key === "now" ? "bg-cobalt-soft/40" : "bg-sunken/50")}>
                  <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
                    <span className="eyebrow">{label}</span>
                    <span className="text-[12px] text-muted">{col.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {col.map((i) => (
                      <li key={i.id} className="rounded-md border border-line bg-surface p-2.5">
                        <div className="text-[13.5px] font-medium leading-snug">{i.title}</div>
                        {i.description && <p className="mt-1 line-clamp-3 text-[12.5px] text-ink-2">{i.description}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                          {!productId && i.productSlug && (
                            <Link href={`/w/${ctx.workspaceSlug}/products/${i.productSlug}/roadmap`} className="flex items-center gap-1 hover:text-cobalt">
                              <span className="size-2 rounded-sm" style={{ background: i.productColor ?? undefined }} />{i.productName}
                            </Link>
                          )}
                          <Badge tone="outline">{i.confidence}</Badge>
                          {i.targetDate && <span>{formatDate(i.targetDate, { month: "short", day: "numeric" })}</span>}
                        </div>
                        <div className="mt-1"><RoadmapItemControls slug={ctx.workspaceSlug} id={i.id} horizon={i.horizon} canEdit={canEdit} /></div>
                      </li>
                    ))}
                    {!col.length && <li className="px-1.5 pb-2 text-[12px] text-muted">Empty</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

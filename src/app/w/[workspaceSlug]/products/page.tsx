import Link from "next/link";
import { LayoutGrid, List, Plus } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listGroups, listProducts, type ProductFilters } from "@/modules/portfolio/service";
import { taskCountsByProduct } from "@/modules/work/service";
import { FOCUSES, HEALTHS, LIFECYCLES, PRIORITIES, PRODUCT_ROLES, label } from "@/modules/portfolio/constants";
import { FilterBar } from "@/components/client/filter-bar";
import { ProductTable } from "@/components/client/product-table";
import { GroupManager } from "@/components/client/group-manager";
import { EmptyState, HealthBadge, LifecycleBadge, NoAccess, PageHeader, ProductMark } from "@/components/ui";
import { cn } from "@/lib/format";

export const metadata = { title: "Products" };

const pick = <T extends string>(v: unknown, xs: readonly T[]) => (typeof v === "string" && (xs as readonly string[]).includes(v) ? (v as T) : undefined);
const opts = (xs: readonly string[]) => xs.filter((x) => x !== "none").map((v) => ({ value: v, label: label(v) }));

export default async function PortfolioPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/products">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "product.view")) return <NoAccess what="products" />;
  const base = `/w/${ctx.workspaceSlug}`;
  const archived = sp.view === "archived";
  const layout = sp.layout === "grid" ? "grid" : "table";

  const filters: ProductFilters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    lifecycle: pick(sp.lifecycle, LIFECYCLES),
    role: pick(sp.role, PRODUCT_ROLES),
    priority: pick(sp.priority, PRIORITIES),
    focus: pick(sp.focus, FOCUSES),
    health: pick(sp.health, HEALTHS),
    groupId: typeof sp.group === "string" ? sp.group : undefined,
    sort: pick(sp.sort, ["name", "priority", "updated", "lifecycle"] as const),
    archived,
  };
  const [rows, groups, counts] = await Promise.all([listProducts(ctx, filters), listGroups(ctx), taskCountsByProduct(ctx)]);
  const countObj = Object.fromEntries([...counts.entries()].filter(([k]) => k).map(([k, v]) => [k!, { open: v.open, overdue: v.overdue }]));
  const filtered = Object.values(filters).some((v) => v !== undefined && v !== false);

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="Every product in this project, its stage and what it needs."
        actions={
          <>
            <GroupManager slug={ctx.workspaceSlug} groups={groups} canEdit={can(ctx, "product.edit")} />
            {can(ctx, "product.create") && (
              <Link href={`${base}/products/new`} className="btn btn-primary"><Plus className="size-4" /> New product</Link>
            )}
          </>
        }
      />

      <div className="mb-4 flex items-center gap-1 border-b border-line">
        {(
          [
            ["Active", null],
            ["Archived", "archived"],
          ] as const
        ).map(([l, v]) => (
          <Link
            key={l}
            href={qs({ view: v })}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[13.5px]", (v === "archived") === archived ? "border-cobalt font-medium text-ink" : "border-transparent text-muted hover:text-ink")}
          >
            {l}
          </Link>
        ))}
      </div>

      <FilterBar
        searchPlaceholder="Search name, summary or tag"
        fields={[
          { name: "lifecycle", label: "Stage", options: opts(LIFECYCLES) },
          { name: "priority", label: "Priority", options: opts(PRIORITIES) },
          { name: "health", label: "Health", options: opts(HEALTHS) },
          { name: "role", label: "Role", options: opts(PRODUCT_ROLES) },
          { name: "focus", label: "Focus", options: opts(FOCUSES) },
          ...(groups.length ? [{ name: "group", label: "Group", options: groups.map((g) => ({ value: g.id, label: g.name })) }] : []),
          { name: "sort", label: "Sort: priority", options: [{ value: "name", label: "Sort: name" }, { value: "updated", label: "Sort: recently updated" }, { value: "lifecycle", label: "Sort: stage" }] },
        ]}
      >
        <div className="flex rounded-md border border-line-strong bg-surface p-0.5">
          <Link href={qs({ layout: null })} aria-label="Table view" className={cn("rounded p-1.5", layout === "table" ? "bg-ink text-bg" : "text-muted")}>
            <List className="size-4" />
          </Link>
          <Link href={qs({ layout: "grid" })} aria-label="Grid view" className={cn("rounded p-1.5", layout === "grid" ? "bg-ink text-bg" : "text-muted")}>
            <LayoutGrid className="size-4" />
          </Link>
        </div>
      </FilterBar>

      {!rows.length ? (
        <div className="panel">
          <EmptyState
            title={filtered ? "No projects match" : archived ? "Nothing archived" : "No projects yet"}
            action={!filtered && !archived && can(ctx, "product.create") ? <Link href={`${base}/products/new`} className="btn btn-primary"><Plus className="size-4" /> Add your first project</Link> : undefined}
          >
            {filtered ? "Try clearing a filter." : archived ? "Archived projects appear here and can be restored." : "Add every project you run — live, half-built or just an idea — and see them side by side."}
          </EmptyState>
        </div>
      ) : (
        <>
        {/* Cards on phones regardless of view; the table only on wider screens. */}
        <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", layout === "table" && "md:hidden")}>
          {rows.map((p) => (
            <Link key={p.id} href={`${base}/products/${p.slug}`} className="panel group flex flex-col p-4 transition-colors hover:border-cobalt">
              <div className="flex items-start gap-3">
                <ProductMark name={p.name} color={p.brandColor} className="size-9 text-base" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-lg leading-tight group-hover:text-cobalt">{p.name}</div>
                  <div className="text-[12.5px] text-muted">{label(p.type)} · {label(p.priority)}</div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 min-h-[2.6em] text-ink-2">{p.summary || "No summary yet."}</p>
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <LifecycleBadge lifecycle={p.lifecycle} />
                <HealthBadge health={p.health} />
                {countObj[p.id]?.overdue ? <span className="text-[12px] text-bad">{countObj[p.id]!.overdue} late</span> : null}
              </div>
            </Link>
          ))}
        </div>
        {layout === "table" && (
          <div className="hidden md:block">
            <ProductTable slug={ctx.workspaceSlug} rows={rows} canEdit={can(ctx, "product.edit") && !archived} groups={groups} counts={countObj} />
          </div>
        )}
        </>
      )}
      <p className="mt-3 text-[12px] text-muted">{rows.length} project{rows.length === 1 ? "" : "s"}</p>
    </>
  );
}

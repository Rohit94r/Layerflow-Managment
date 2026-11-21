import Link from "next/link";
import { Archive, Pin, PinOff } from "lucide-react";
import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { label } from "@/modules/portfolio/constants";
import { setArchivedAction, togglePinAction } from "@/modules/portfolio/actions";
import { Badge, HealthBadge, LifecycleBadge, PRIORITY_TONE, ProductMark } from "@/components/ui";
import { Tabs } from "@/components/client/tabs";
import { ActionButton } from "@/components/client/forms";

export async function generateMetadata({ params }: LayoutProps<"/w/[workspaceSlug]/products/[productSlug]">) {
  const { workspaceSlug, productSlug } = await params;
  const { product } = await loadProductPage(workspaceSlug, productSlug);
  return { title: product.name };
}

export default async function ProductLayout({ children, params }: LayoutProps<"/w/[workspaceSlug]/products/[productSlug]">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product: p, base } = await loadProductPage(workspaceSlug, productSlug);
  const slug = ctx.workspaceSlug;

  return (
    <>
      {p.archivedAt && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-[13.5px] text-warn">
          <Archive className="size-4" />
          <span className="flex-1">This project is archived. It&apos;s hidden from the projects list and command center.</span>
          {can(ctx, "product.archive") && (
            <ActionButton onClick={setArchivedAction.bind(null, slug, p.id, false)} successMessage="Project restored.">Restore</ActionButton>
          )}
        </div>
      )}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <ProductMark name={p.name} color={p.brandColor} className="size-12 rounded-lg text-xl" />
        <div className="min-w-0 flex-1">
          <div className="eyebrow mb-1">
            <Link href={`/w/${slug}/products`} className="hover:text-ink">Projects</Link>
            {p.parent && (
              <>
                {" / "}
                <Link href={`/w/${slug}/products/${p.parent.slug}`} className="hover:text-cobalt">{p.parent.name}</Link>
              </>
            )}
            {p.groupName && <> · {p.groupName}</>}
          </div>
          <h1 className="text-[1.9rem] leading-tight">{p.name}</h1>
          {p.summary && <p className="mt-1 max-w-2xl text-ink-2">{p.summary}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <LifecycleBadge lifecycle={p.lifecycle} />
            <HealthBadge health={p.health} />
            <Badge tone={PRIORITY_TONE[p.priority]}>{label(p.priority)}</Badge>
            <Badge tone="outline">{label(p.role)}</Badge>
            <Badge tone="outline">{label(p.type)}</Badge>
            {p.focus !== "none" && <Badge tone="cobalt">{label(p.focus)}</Badge>}
          </div>
        </div>
        {can(ctx, "product.edit") && !p.archivedAt && (
          <div className="flex gap-2">
            <ActionButton
              onClick={togglePinAction.bind(null, slug, p.id)}
              title={p.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
              successMessage={p.pinned ? "Unpinned." : "Pinned to sidebar."}
            >
              {p.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              {p.pinned ? "Unpin" : "Pin"}
            </ActionButton>
          </div>
        )}
      </div>
      <Tabs
        items={[
          { href: base, label: "Overview", exact: true },
          ...(can(ctx, "work.view") ? [{ href: `${base}/work`, label: "Work" }] : []),
          ...(can(ctx, "planning.view") ? [{ href: `${base}/roadmap`, label: "Roadmap" }] : []),
          ...(can(ctx, "docs.view") ? [{ href: `${base}/docs`, label: "Docs" }] : []),
          ...(can(ctx, "analytics.view") || can(ctx, "seo.view") ? [{ href: `${base}/growth`, label: "Growth" }] : []),
          ...(can(ctx, "content.view") ? [{ href: `${base}/content`, label: "Content" }] : []),
          ...(can(ctx, "seo.view") ? [{ href: `${base}/seo`, label: "SEO & uptime" }] : []),
          ...(can(ctx, "agent.view") ? [{ href: `${base}/agents`, label: "Agents" }] : []),
          ...(can(ctx, "finance.view") ? [{ href: `${base}/finance`, label: "Finance" }] : []),
          ...(can(ctx, "audit.view") ? [{ href: `${base}/activity`, label: "Activity" }] : []),
          ...(can(ctx, "product.edit") ? [{ href: `${base}/settings`, label: "Settings" }] : []),
        ]}
      />
      {children}
    </>
  );
}

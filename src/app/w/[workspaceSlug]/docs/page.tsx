import Link from "next/link";
import { Plus } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listDocs } from "@/modules/knowledge/service";
import { productOptions } from "@/modules/portfolio/service";
import { DOC_KINDS, docLabel, type DocKind } from "@/modules/knowledge/constants";
import { FilterBar } from "@/components/client/filter-bar";
import { DocList } from "@/components/doc-list";
import { NoAccess, PageHeader } from "@/components/ui";

export const metadata = { title: "Docs & decisions" };

export default async function DocsPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/docs">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "docs.view")) return <NoAccess what="documents" />;
  const kind = typeof sp.kind === "string" && (DOC_KINDS as readonly string[]).includes(sp.kind) ? (sp.kind as DocKind) : undefined;
  const [docs, products] = await Promise.all([
    listDocs(ctx, { kind, productId: typeof sp.product === "string" ? sp.product : undefined, q: typeof sp.q === "string" ? sp.q : undefined }),
    productOptions(ctx),
  ]);
  const newLink = can(ctx, "docs.edit") ? <Link href={`/w/${ctx.workspaceSlug}/docs/new`} className="btn btn-primary"><Plus className="size-4" /> New document</Link> : null;
  return (
    <>
      <PageHeader title="Docs & decisions" description="The written memory of your projects: specs, runbooks, notes and the decisions behind them." actions={newLink} />
      <FilterBar
        searchPlaceholder="Search titles and content"
        fields={[
          { name: "kind", label: "All kinds", options: DOC_KINDS.map((k) => ({ value: k, label: docLabel(k) })) },
          { name: "product", label: "All projects", options: products.map((p) => ({ value: p.id, label: p.name })) },
        ]}
      />
      <DocList slug={ctx.workspaceSlug} docs={docs} emptyAction={newLink} />
    </>
  );
}

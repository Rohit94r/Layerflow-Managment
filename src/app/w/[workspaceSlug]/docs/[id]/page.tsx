import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { getDoc } from "@/modules/knowledge/service";
import { productOptions } from "@/modules/portfolio/service";
import { deleteDocAction, updateDocAction } from "@/modules/knowledge/actions";
import { DOC_KINDS, DOC_STATUSES, docLabel } from "@/modules/knowledge/constants";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/client/forms";
import { Markdown } from "@/components/markdown";
import { Badge, NoAccess } from "@/components/ui";
import { formatDate, relativeTime, today } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/w/[workspaceSlug]/docs/[id]">) {
  const { workspaceSlug, id } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  const doc = can(ctx, "docs.view") ? await getDoc(ctx, id) : null;
  return { title: doc?.title ?? "Document" };
}

export default async function DocPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/docs/[id]">) {
  const { workspaceSlug, id } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "docs.view")) return <NoAccess what="documents" />;
  const doc = await getDoc(ctx, id);
  if (!doc) notFound();
  const canEdit = can(ctx, "docs.edit");
  const editing = canEdit && sp.edit === "1";
  const base = `/w/${ctx.workspaceSlug}`;

  if (editing) {
    const products = await productOptions(ctx);
    return (
      <ActionForm action={updateDocAction.bind(null, ctx.workspaceSlug, doc.id)} className="space-y-4">
        <div className="eyebrow">Editing · {docLabel(doc.kind)}</div>
        <input name="title" defaultValue={doc.title} required maxLength={200} aria-label="Title" className="w-full bg-transparent font-serif text-[2rem] leading-tight outline-none" />
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="kind">Kind</label>
            <select id="kind" name="kind" className="input" defaultValue={doc.kind}>
              {DOC_KINDS.map((k) => <option key={k} value={k}>{docLabel(k)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" className="input" defaultValue={doc.status}>
              {DOC_STATUSES.map((k) => <option key={k} value={k}>{docLabel(k)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="productId">Project</label>
            <select id="productId" name="productId" className="input" defaultValue={doc.productId ?? ""}>
              <option value="">Workspace-wide</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="revisitDate">Revisit on</label>
            <input id="revisitDate" name="revisitDate" type="date" className="input" defaultValue={doc.revisitDate ?? ""} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="body">Content (Markdown)</label>
          <textarea id="body" name="body" defaultValue={doc.body} rows={24} className="input font-mono text-[13px] leading-relaxed" />
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-bg/95 py-3 backdrop-blur">
          <Link href={`${base}/docs/${doc.id}`} className="btn btn-ghost">Cancel</Link>
          <SubmitButton>Save document</SubmitButton>
        </div>
      </ActionForm>
    );
  }

  return (
    <article className="mx-auto max-w-3xl">
      <div className="eyebrow mb-3">
        <Link href={`${base}/docs`} className="hover:text-cobalt">Docs</Link>
        {doc.productSlug && (
          <>
            {" / "}
            <Link href={`${base}/products/${doc.productSlug}/docs`} className="hover:text-cobalt">{doc.productName}</Link>
          </>
        )}
      </div>
      <div className="flex items-start gap-3">
        <h1 className="flex-1 text-[2.1rem] leading-tight">{doc.title}</h1>
        {canEdit && (
          <Link href={`${base}/docs/${doc.id}?edit=1`} className="btn btn-secondary btn-sm">
            <Pencil className="size-3.5" /> Edit
          </Link>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
        <Badge tone={doc.kind === "decision" ? "cobalt" : "neutral"}>{docLabel(doc.kind)}</Badge>
        <Badge tone={doc.status === "active" ? "good" : "outline"}>{docLabel(doc.status)}</Badge>
        {doc.revisitDate && <Badge tone={doc.revisitDate <= today() ? "warn" : "outline"}>Revisit {formatDate(doc.revisitDate)}</Badge>}
        <span className="ml-1">Edited {relativeTime(doc.updatedAt)}{doc.editorName && ` by ${doc.editorName}`}</span>
      </div>
      <div className="panel mt-6 px-5 py-4 sm:px-8 sm:py-6">
        {doc.body.trim() ? <Markdown source={doc.body} /> : <p className="text-muted">This document is empty.</p>}
      </div>
      {canEdit && (
        <div className="mt-6 flex justify-end">
          <ConfirmButton onConfirm={deleteDocAction.bind(null, ctx.workspaceSlug, doc.id)} confirmLabel="Delete this document?">
            <Trash2 className="size-3.5" /> Delete
          </ConfirmButton>
        </div>
      )}
    </article>
  );
}

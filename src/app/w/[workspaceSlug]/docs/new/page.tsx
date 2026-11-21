import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { productOptions } from "@/modules/portfolio/service";
import { createDocAction } from "@/modules/knowledge/actions";
import { DOC_KINDS, docLabel } from "@/modules/knowledge/constants";
import { ActionForm, SubmitButton } from "@/components/client/forms";
import { NoAccess, PageHeader } from "@/components/ui";

export const metadata = { title: "New document" };

const KIND_HELP: Record<string, string> = {
  doc: "Free-form page.",
  decision: "Context, options, decision and trade-offs — with a revisit date.",
  prd: "Problem, users, stories, scope and acceptance criteria.",
  runbook: "Step-by-step operational procedure with rollback.",
  meeting: "Attendees, notes, decisions and action items.",
  research: "Question, method, findings and implications.",
};

export default async function NewDocPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/docs/new">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "docs.edit")) return <NoAccess what="document editing" />;
  const products = await productOptions(ctx);
  const defaultKind = typeof sp.kind === "string" ? sp.kind : "doc";

  return (
    <>
      <PageHeader eyebrow="Docs & decisions" title="New document" description="Pick a template; you can edit everything afterwards." />
      <div className="panel max-w-2xl p-5 sm:p-7">
        <ActionForm action={createDocAction.bind(null, ctx.workspaceSlug)} className="space-y-5">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" className="input" required maxLength={200} autoFocus placeholder="e.g. Move billing to annual plans" />
          </div>
          <fieldset>
            <legend className="label">Template</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {DOC_KINDS.map((k) => (
                <label key={k} className="flex cursor-pointer gap-3 rounded-md border border-line bg-bg p-3 has-[:checked]:border-cobalt has-[:checked]:bg-cobalt-soft">
                  <input type="radio" name="kind" value={k} defaultChecked={k === defaultKind} className="mt-1 accent-[var(--cobalt)]" />
                  <span>
                    <span className="block font-medium">{docLabel(k)}</span>
                    <span className="block text-[12.5px] text-muted">{KIND_HELP[k]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="productId">Project</label>
            <select id="productId" name="productId" className="input" defaultValue={typeof sp.product === "string" ? sp.product : ""}>
              <option value="">Workspace-wide</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <SubmitButton>Create and edit</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  );
}

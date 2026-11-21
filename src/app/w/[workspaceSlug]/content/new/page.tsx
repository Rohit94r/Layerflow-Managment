import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { productOptions } from "@/modules/portfolio/service";
import { createPostAction } from "@/modules/content/actions";
import { FUNNEL_STAGES, SEARCH_INTENTS, postLabel } from "@/modules/content/constants";
import { ActionForm, SubmitButton } from "@/components/client/forms";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "New post" };

export default async function NewPostPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/content/new">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "content.edit")) return <NoAccess what="writing posts" />;
  const products = await productOptions(ctx);
  const pre = products.find((p) => p.slug === sp.product)?.id ?? products[0]?.id ?? "";
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 200) : "");

  if (!products.length) {
    return (
      <div className="panel">
        <EmptyState title="Add a project first" action={<Link href={`/w/${ctx.workspaceSlug}/products/new`} className="btn btn-primary">Add project</Link>}>
          Every post belongs to a project, so its blog, SEO and analytics stay together.
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Content" title="New post" description="Start with the search phrase you want to win. You'll write and refine the post in the editor." />
      <div className="panel max-w-2xl p-5 sm:p-7">
        <ActionForm action={createPostAction.bind(null, ctx.workspaceSlug)} className="space-y-5">
          <div>
            <label className="label" htmlFor="productId">Project</label>
            <select id="productId" name="productId" className="input" defaultValue={pre} required>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="title">Working title</label>
            <input id="title" name="title" className="input" required maxLength={200} autoFocus defaultValue={str("title")} placeholder="e.g. How to find hackathons you can actually win" />
          </div>
          <div>
            <label className="label" htmlFor="targetKeyword">Target keyword</label>
            <input id="targetKeyword" name="targetKeyword" className="input" maxLength={120} defaultValue={str("keyword")} placeholder="e.g. find hackathons" />
            <p className="hint">The one phrase this post should rank for. Pick from your SEO opportunities when you can.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="searchIntent">Search intent</label>
              <select id="searchIntent" name="searchIntent" className="input" defaultValue="informational">
                {SEARCH_INTENTS.map((s) => <option key={s} value={s}>{postLabel(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="funnelStage">Funnel stage</label>
              <select id="funnelStage" name="funnelStage" className="input" defaultValue="awareness">
                {FUNNEL_STAGES.map((s) => <option key={s} value={s}>{postLabel(s)}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="flex flex-wrap gap-4 text-[13.5px]">
            <legend className="label">Start as</legend>
            <label className="flex items-center gap-2"><input type="radio" name="status" value="draft" defaultChecked className="accent-[var(--cobalt)]" /> Draft</label>
            <label className="flex items-center gap-2"><input type="radio" name="status" value="idea" className="accent-[var(--cobalt)]" /> Idea (park it for later)</label>
          </fieldset>
          <div className="flex justify-end">
            <SubmitButton>Create and open editor</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  );
}

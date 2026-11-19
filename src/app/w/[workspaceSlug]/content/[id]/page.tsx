import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Bot, CheckCheck, RotateCcw, Send, Trash2, Undo2 } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { getChannel, getPost, hostedBlogPath, appOrigin } from "@/modules/content/service";
import { STATUS_TONE, postLabel, type PostStatus } from "@/modules/content/constants";
import { deletePostAction, publishPostAction, setPostStatusAction, unpublishPostAction } from "@/modules/content/actions";
import { PostEditor, ScheduleButton } from "@/components/client/content-editor";
import { ActionButton, ConfirmButton } from "@/components/client/forms";
import { Badge, NoAccess, Panel } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/w/[workspaceSlug]/content/[id]">) {
  const { workspaceSlug, id } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  const p = can(ctx, "content.view") ? await getPost(ctx, id) : null;
  return { title: p?.title ?? "Post" };
}

export default async function PostPage({ params }: PageProps<"/w/[workspaceSlug]/content/[id]">) {
  const { workspaceSlug, id } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "content.view")) return <NoAccess what="content" />;
  const post = await getPost(ctx, id);
  if (!post) notFound();
  const channel = await getChannel(ctx, post.productId);
  const slug = ctx.workspaceSlug;
  const canEdit = can(ctx, "content.edit");
  const canPublish = can(ctx, "content.publish");
  const s = post.status as PostStatus;
  const locked = s === "published" || s === "scheduled" || s === "approved";
  const readOnly = !canEdit || (locked && !canPublish) || s === "archived";
  const publicBase = channel.destination === "webhook"
    ? (channel.siteBlogUrl ?? "https://your-site.com/blog").replace(/\/$/, "")
    : `${appOrigin()}${hostedBlogPath(slug, post.productSlug)}`;
  const dest = channel.destination === "webhook" ? "your site (webhook)" : channel.hostedEnabled ? "the hosted blog" : "the hosted blog (currently switched off)";

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5 flex flex-wrap items-center gap-1">
            <Link href={`/w/${slug}/content`} className="hover:text-cobalt">Content</Link> /
            <Link href={`/w/${slug}/products/${post.productSlug}/content`} className="hover:text-cobalt">{post.productName}</Link>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONE[s]}>{postLabel(s)}</Badge>
            {post.source === "agent" && <Badge tone="cobalt"><Bot className="size-3" /> Written by an agent</Badge>}
            {s === "scheduled" && post.scheduledAt && <span className="text-[12.5px] text-muted">Goes out {formatDate(post.scheduledAt, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
            {s === "published" && post.publishedAt && <span className="text-[12.5px] text-muted">Published {relativeTime(post.publishedAt)}</span>}
            <span className="text-[12.5px] text-muted">· Publishes to {dest}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {s === "published" && post.liveUrl && (
            <a href={post.liveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><ArrowUpRight className="size-3.5" /> View live</a>
          )}
          {canEdit && s === "idea" && <ActionButton onClick={setPostStatusAction.bind(null, slug, id, "draft")}>Start draft</ActionButton>}
          {canEdit && s === "draft" && <ActionButton onClick={setPostStatusAction.bind(null, slug, id, "in_review")} successMessage="Sent for review."><Send className="size-3.5" /> Request review</ActionButton>}
          {canPublish && (s === "draft" || s === "in_review") && <ActionButton onClick={setPostStatusAction.bind(null, slug, id, "approved")} successMessage="Approved."><CheckCheck className="size-3.5" /> Approve</ActionButton>}
          {canEdit && (s === "in_review" || (canPublish && (s === "approved" || s === "scheduled"))) && (
            <ActionButton onClick={setPostStatusAction.bind(null, slug, id, s === "scheduled" ? "approved" : "draft")} className="btn btn-ghost btn-sm">
              <Undo2 className="size-3.5" /> {s === "scheduled" ? "Unschedule" : "Back to draft"}
            </ActionButton>
          )}
          {canPublish && ["draft", "in_review", "approved", "scheduled"].includes(s) && <ScheduleButton slug={slug} id={id} current={post.scheduledAt?.toISOString() ?? null} />}
          {canPublish && ["draft", "in_review", "approved", "scheduled"].includes(s) && (
            <ConfirmButton onConfirm={publishPostAction.bind(null, slug, id)} className="btn btn-primary btn-sm" confirmLabel="Publish now?">
              <ArrowUpRight className="size-3.5" /> Publish
            </ConfirmButton>
          )}
          {canPublish && s === "published" && (
            <ConfirmButton onConfirm={unpublishPostAction.bind(null, slug, id)} confirmLabel="Take it offline?">Unpublish</ConfirmButton>
          )}
          {canEdit && s === "archived" && <ActionButton onClick={setPostStatusAction.bind(null, slug, id, "draft")}><RotateCcw className="size-3.5" /> Restore</ActionButton>}
          {canEdit && !["published", "scheduled", "archived"].includes(s) && (
            <ConfirmButton onConfirm={deletePostAction.bind(null, slug, id)} confirmLabel="Delete forever?"><Trash2 className="size-3.5" /></ConfirmButton>
          )}
        </div>
      </div>

      {locked && !canPublish && canEdit && (
        <p className="mb-4 rounded-md border border-line bg-sunken px-4 py-2.5 text-[13px] text-ink-2">This post is {postLabel(s).toLowerCase()}. Only publishers can edit it now.</p>
      )}

      <PostEditor
        slug={slug}
        readOnly={readOnly}
        publicBase={publicBase}
        post={{
          id: post.id, title: post.title, slug: post.slug, excerpt: post.excerpt, body: post.body, metaTitle: post.metaTitle, metaDescription: post.metaDescription,
          targetKeyword: post.targetKeyword, secondaryKeywords: post.secondaryKeywords, searchIntent: post.searchIntent, funnelStage: post.funnelStage,
          canonicalUrl: post.canonicalUrl, coverImageUrl: post.coverImageUrl, authorName: post.authorName, tags: post.tags,
        }}
      />

      <Panel title="Delivery log" className="mt-6" action={<span className="text-[12px] text-muted">Only confirmed deliveries count as published</span>}>
        {post.publications.length ? (
          <ul className="divide-y divide-line">
            {post.publications.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
                <Badge tone={d.status === "succeeded" ? "good" : d.status === "failed" ? "bad" : "outline"}>{d.status}</Badge>
                <span className="font-medium">{d.target === "indexnow" ? "IndexNow" : d.target === "webhook" ? "Webhook" : "Hosted blog"}</span>
                <span className="min-w-0 flex-1 text-ink-2">{d.detail}{d.responseCode ? ` (HTTP ${d.responseCode})` : ""}</span>
                <span className="text-[12px] text-muted">{d.actorType} · {relativeTime(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-[13px] text-muted">No publishing attempts yet.</p>
        )}
        {post.agentRunId && can(ctx, "agent.view") && (
          <p className="border-t border-line px-4 py-2 text-[12px] text-muted">
            Drafted in <Link className="link" href={`/w/${slug}/agents/runs/${post.agentRunId}`}>agent run {post.agentRunId.slice(-8)}</Link>.
          </p>
        )}
      </Panel>
    </>
  );
}

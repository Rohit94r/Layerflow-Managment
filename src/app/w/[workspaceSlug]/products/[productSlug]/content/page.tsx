import Link from "next/link";
import { Plus } from "lucide-react";
import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { appOrigin, getChannel, hostedBlogPath, listPosts } from "@/modules/content/service";
import { ContentCalendar, PostList } from "@/components/content-views";
import { ChannelSettings } from "@/components/client/channel-settings";
import { Badge, EmptyState, NoAccess, Panel } from "@/components/ui";

export default async function ProductContent({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/content">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "content.view")) return <NoAccess what="content" />;
  const [posts, channel] = await Promise.all([listPosts(ctx, { productId: product.id, status: "active" }), getChannel(ctx, product.id)]);
  const hostedUrl = `${appOrigin()}${hostedBlogPath(ctx.workspaceSlug, product.slug)}`;
  const live = channel.destination === "hosted" ? channel.hostedEnabled : Boolean(channel.webhookUrl);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6">
        <Panel
          title="Posts"
          action={can(ctx, "content.edit") ? <Link href={`/w/${ctx.workspaceSlug}/content/new?product=${product.slug}`} className="btn btn-primary btn-sm"><Plus className="size-3.5" /> New post</Link> : undefined}
        >
          <PostList
            slug={ctx.workspaceSlug}
            posts={posts}
            showProduct={false}
            empty={<EmptyState compact title="No posts for this product yet">Write one, or install the Content Writer agent scoped to {product.name} to get a draft every week.</EmptyState>}
          />
        </Panel>
        <ContentCalendar ctx={ctx} productId={product.id} />
      </div>
      <Panel
        title="Publishing"
        action={live ? <Badge tone="good">{channel.destination === "hosted" ? "Blog is public" : "Webhook set"}</Badge> : <Badge tone="outline">Not set up</Badge>}
        className="self-start"
      >
        {channel.destination === "hosted" && channel.hostedEnabled && (
          <p className="border-b border-line px-4 py-2 text-[12.5px] sm:px-5">
            <a href={hostedUrl} target="_blank" rel="noopener noreferrer" className="link">Open the public blog ↗</a>
          </p>
        )}
        <ChannelSettings
          slug={ctx.workspaceSlug}
          productId={product.id}
          hostedUrl={hostedUrl}
          canEdit={can(ctx, "content.publish")}
          canAuto={can(ctx, "workspace.manage")}
          v={{
            hostedEnabled: channel.hostedEnabled, blogTitle: channel.blogTitle, blogDescription: channel.blogDescription, destination: channel.destination,
            webhookUrl: channel.webhookUrl, siteBlogUrl: channel.siteBlogUrl, publishPolicy: channel.publishPolicy, indexNowEnabled: channel.indexNowEnabled,
            indexNowKey: channel.indexNowKey, weeklyAgentLimit: channel.weeklyAgentLimit, webhookSecret: channel.webhookSecret, hasSecret: channel.hasSecret,
          }}
        />
      </Panel>
    </div>
  );
}

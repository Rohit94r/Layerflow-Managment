import { Shell } from "@/components/client/shell";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listUserWorkspaces } from "@/modules/identity/service";
import { productOptions } from "@/modules/portfolio/service";
import { unreadCount } from "@/modules/automation/inbox";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[workspaceSlug]">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  const [workspaces, products, inboxCount] = await Promise.all([
    listUserWorkspaces(ctx.userId),
    can(ctx, "product.view") ? productOptions(ctx) : Promise.resolve([]),
    unreadCount(ctx),
  ]);
  return (
    <Shell
      slug={ctx.workspaceSlug}
      workspaceName={ctx.workspace.name}
      workspaces={workspaces}
      products={products}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      inboxCount={inboxCount}
      caps={{
        finance: can(ctx, "finance.view"), audit: can(ctx, "audit.view"), seo: can(ctx, "seo.view"), planning: can(ctx, "planning.view"),
        automation: can(ctx, "automation.view"), agents: can(ctx, "agent.view"), integrations: can(ctx, "integration.view"),
        content: can(ctx, "content.view"), growth: can(ctx, "analytics.view") || can(ctx, "seo.view"), work: can(ctx, "work.view"),
        newContent: can(ctx, "content.edit"),
        team: can(ctx, "members.view"), invite: can(ctx, "members.manage"), createProject: can(ctx, "product.create"),
      }}
    >
      {children}
    </Shell>
  );
}

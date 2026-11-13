import { Shell } from "@/components/client/shell";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listUserWorkspaces } from "@/modules/identity/service";
import { productOptions } from "@/modules/portfolio/service";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[workspaceSlug]">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  const [workspaces, products] = await Promise.all([
    listUserWorkspaces(ctx.userId),
    can(ctx, "product.view") ? productOptions(ctx) : Promise.resolve([]),
  ]);
  return (
    <Shell
      slug={ctx.workspaceSlug}
      workspaceName={ctx.workspace.name}
      workspaces={workspaces}
      products={products}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      caps={{
        finance: can(ctx, "finance.view"), audit: can(ctx, "audit.view"), seo: can(ctx, "seo.view"), planning: can(ctx, "planning.view"),
        automation: can(ctx, "automation.view"), agents: can(ctx, "agent.view"), integrations: can(ctx, "integration.view"),
      }}
    >
      {children}
    </Shell>
  );
}

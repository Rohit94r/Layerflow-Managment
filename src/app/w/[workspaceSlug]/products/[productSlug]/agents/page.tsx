import Link from "next/link";
import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { listAgents } from "@/modules/agents/service";
import { AgentList } from "@/components/agent-list";
import { NoAccess, Panel } from "@/components/ui";

export default async function ProductAgents({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/agents">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "agent.view")) return <NoAccess what="agents" />;
  const agents = await listAgents(ctx, product.id);
  return (
    <Panel title="Agents scoped to this project" action={<Link href={`/w/${ctx.workspaceSlug}/agents`} className="link text-[12.5px]">Agent catalog</Link>}>
      <AgentList slug={ctx.workspaceSlug} agents={agents} />
    </Panel>
  );
}

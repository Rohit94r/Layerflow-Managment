import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { FinanceView } from "@/components/finance-view";
import { NoAccess, PageHeader } from "@/components/ui";

export const metadata = { title: "Finance" };

export default async function FinancePage({ params }: PageProps<"/w/[workspaceSlug]/finance">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "finance.view")) return <NoAccess what="finance" />;
  return (
    <>
      <PageHeader title="Finance" description="What each product costs, what renews next, and what it earns." />
      <FinanceView ctx={ctx} currency={ctx.workspace.currency} />
    </>
  );
}

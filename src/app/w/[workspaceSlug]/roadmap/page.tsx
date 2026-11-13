import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { RoadmapView } from "@/components/roadmap-view";
import { NoAccess, PageHeader } from "@/components/ui";

export const metadata = { title: "Roadmap & goals" };

export default async function RoadmapPage({ params }: PageProps<"/w/[workspaceSlug]/roadmap">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "planning.view")) return <NoAccess what="the roadmap" />;
  return (
    <>
      <PageHeader title="Roadmap & goals" description="What you're doing now, next and later across the portfolio, and the measurable goals it serves." />
      <RoadmapView ctx={ctx} />
    </>
  );
}

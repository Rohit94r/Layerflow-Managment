import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listInvitations, listMembers } from "@/modules/identity/service";
import { InviteForm, MembersTable } from "@/components/client/settings-forms";
import { NoAccess, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Team" };

/** Everyone in the workspace, their role, and invitations. */
export default async function TeamPage({ params }: PageProps<"/w/[workspaceSlug]/team">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "members.view")) return <NoAccess what="the team" />;
  const canManage = can(ctx, "members.manage");
  const [members, invitations] = await Promise.all([listMembers(ctx), canManage ? listInvitations(ctx) : []]);

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone who works on your projects and what each person can do. Invite someone with a one-time link; they join with that email and see only what their role allows."
      />
      <div className="space-y-6">
        {canManage && (
          <section id="invite" className="scroll-mt-20">
            <Panel title="Invite a team member">
              <InviteForm slug={ctx.workspaceSlug} invitations={invitations} />
            </Panel>
          </section>
        )}
        <Panel title="Members" action={<span className="text-[12px] text-muted">{members.length} member{members.length === 1 ? "" : "s"}</span>}>
          <MembersTable slug={ctx.workspaceSlug} members={members} me={ctx.userId} myRole={ctx.role} canManage={canManage} />
        </Panel>
      </div>
    </>
  );
}

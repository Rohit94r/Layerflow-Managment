import { Download } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can, ROLE_CAPABILITIES } from "@/server/permissions";
import { listInvitations, listMembers } from "@/modules/identity/service";
import { ROLE_LABELS } from "@/modules/identity/constants";
import { DeleteWorkspaceForm, InviteForm, MembersTable, WorkspaceSettingsForm } from "@/components/client/settings-forms";
import { PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/w/[workspaceSlug]/settings">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  const slug = ctx.workspaceSlug;
  const canManageMembers = can(ctx, "members.manage");
  const [members, invitations] = await Promise.all([
    can(ctx, "members.view") ? listMembers(ctx) : [],
    canManageMembers ? listInvitations(ctx) : [],
  ]);

  return (
    <>
      <PageHeader title="Settings" description={`You are ${ROLE_LABELS[ctx.role].toLowerCase() === "owner" ? "an owner" : `a ${ROLE_LABELS[ctx.role].toLowerCase()}`} of ${ctx.workspace.name}.`} />
      <div className="space-y-6">
        <Panel title="Workspace">
          <WorkspaceSettingsForm slug={slug} ws={ctx.workspace} canEdit={can(ctx, "workspace.manage")} />
        </Panel>

        {can(ctx, "members.view") && (
          <section id="members" className="scroll-mt-6">
            <Panel title="Members" action={<span className="text-[12px] text-muted">{members.length} member{members.length === 1 ? "" : "s"}</span>}>
              <MembersTable slug={slug} members={members} me={ctx.userId} myRole={ctx.role} canManage={canManageMembers} />
              {canManageMembers && (
                <div className="border-t border-line">
                  <InviteForm slug={slug} invitations={invitations} />
                </div>
              )}
            </Panel>
          </section>
        )}

        <Panel title="Your permissions">
          <p className="px-4 pt-3 text-[13px] text-muted">Enforced on the server for every request, not just hidden in the interface.</p>
          <ul className="flex flex-wrap gap-1.5 p-4">
            {[...ROLE_CAPABILITIES[ctx.role]].map((c) => (
              <li key={c} className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{c}</li>
            ))}
          </ul>
        </Panel>

        {can(ctx, "data.export") && (
          <Panel title="Export">
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <p className="flex-1 text-[13.5px] text-ink-2">Download everything in this workspace as JSON: products, tasks, comments, docs, finance and the full activity log. Your data is never locked in.</p>
              <a href={`/api/w/${slug}/export`} className="btn btn-secondary" download>
                <Download className="size-4" /> Export JSON
              </a>
            </div>
          </Panel>
        )}

        {can(ctx, "workspace.delete") && (
          <Panel title="Delete workspace" className="border-bad/40">
            <div className="space-y-3 px-4 py-4">
              <p className="text-[13.5px] text-ink-2">
                Permanently deletes the workspace and everything in it for every member. Export first if you may need the data. This can&apos;t be undone.
              </p>
              <DeleteWorkspaceForm slug={slug} />
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { INVITABLE_ROLES, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/modules/identity/constants";
import {
  changeRoleAction, deleteWorkspaceAction, inviteAction, removeMemberAction, revokeInviteAction, updateWorkspaceAction,
} from "@/modules/identity/actions";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/ui";
import { ActionForm, ConfirmButton, CopyField, InlineSelect, SubmitButton } from "./forms";

export function WorkspaceSettingsForm({ slug, ws, canEdit }: { slug: string; ws: { name: string; slug: string; timezone: string; currency: string }; canEdit: boolean }) {
  return (
    <ActionForm action={updateWorkspaceAction.bind(null, slug)} className="grid gap-4 p-4 sm:grid-cols-2">
      <fieldset disabled={!canEdit} className="contents">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" defaultValue={ws.name} required maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="slug">Address</label>
          <div className="flex items-center rounded-md border border-line-strong bg-sunken focus-within:border-cobalt">
            <span className="pl-2.5 text-[13px] text-muted">/w/</span>
            <input id="slug" name="slug" className="input border-0 bg-transparent pl-0.5 font-mono text-[13px] focus:shadow-none" defaultValue={ws.slug} maxLength={48} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="timezone">Timezone</label>
          <input id="timezone" name="timezone" className="input" defaultValue={ws.timezone} />
        </div>
        <div>
          <label className="label" htmlFor="currency">Default currency</label>
          <input id="currency" name="currency" className="input uppercase" defaultValue={ws.currency} maxLength={3} />
        </div>
        {canEdit && (
          <div className="flex justify-end sm:col-span-2">
            <SubmitButton>Save</SubmitButton>
          </div>
        )}
      </fieldset>
    </ActionForm>
  );
}

type Member = { id: string; userId: string; name: string; email: string; role: Role; joinedAt: Date };

export function MembersTable({ slug, members, me, myRole, canManage }: { slug: string; members: Member[]; me: string; myRole: Role; canManage: boolean }) {
  const roleOpts = ROLES.filter((r) => r !== "owner" || myRole === "owner").map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[560px]">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Joined</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const self = m.userId === me;
            const editable = canManage && !self && (m.role !== "owner" || myRole === "owner");
            return (
              <tr key={m.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={m.name} className="size-7" />
                    <div>
                      <div className="font-medium">{m.name}{self && <span className="text-muted"> (you)</span>}</div>
                      <div className="text-[12px] text-muted">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {editable ? (
                    <InlineSelect label={`Role for ${m.name}`} value={m.role} options={roleOpts} onSave={(v) => changeRoleAction(slug, m.id, v as Role)} />
                  ) : (
                    <span className="text-[13px]">{ROLE_LABELS[m.role]}</span>
                  )}
                </td>
                <td className="text-[13px] text-muted">{formatDate(m.joinedAt)}</td>
                <td className="text-right">
                  {(editable || self) && (
                    <ConfirmButton
                      onConfirm={() => removeMemberAction(slug, m.id, self)}
                      className="btn btn-ghost btn-sm text-bad"
                      confirmLabel={self ? "Leave workspace?" : "Remove?"}
                    >
                      {self ? "Leave" : <Trash2 className="size-3.5" />}
                    </ConfirmButton>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function InviteForm({ slug, invitations }: { slug: string; invitations: { id: string; email: string; role: Role; expiresAt: Date }[] }) {
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="space-y-4 p-4">
      <ActionForm
        action={inviteAction.bind(null, slug)}
        resetOnSuccess
        onSuccess={(r) => setLink(typeof r.data?.link === "string" ? r.data.link : null)}
        className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
      >
        <div>
          <label className="label" htmlFor="invite-email">Email</label>
          <input id="invite-email" name="email" type="email" className="input" required placeholder="teammate@company.com" />
        </div>
        <div>
          <label className="label" htmlFor="invite-role">Role</label>
          <select id="invite-role" name="role" className="input" defaultValue="member">
            {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <SubmitButton>Create invite</SubmitButton>
      </ActionForm>
      {link && (
        <div className="rounded-md border border-cobalt/40 bg-cobalt-soft/50 p-3">
          <p className="mb-2 text-[13px] text-ink">Send this link to them. It&apos;s shown only once, works once, and expires in 7 days. They must sign in with the invited email.</p>
          <CopyField value={link} />
        </div>
      )}
      <details className="text-[12.5px] text-muted">
        <summary className="cursor-pointer">What can each role do?</summary>
        <ul className="mt-2 space-y-1">
          {ROLES.map((r) => <li key={r}><strong className="text-ink-2">{ROLE_LABELS[r]}:</strong> {ROLE_DESCRIPTIONS[r]}</li>)}
        </ul>
      </details>
      {invitations.length > 0 && (
        <div>
          <div className="eyebrow mb-2">Pending invitations</div>
          <ul className="divide-y divide-line rounded-md border border-line">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <span className="flex-1">{i.email}</span>
                <span className="text-muted">{ROLE_LABELS[i.role]}</span>
                <span className="text-muted">expires {formatDate(i.expiresAt)}</span>
                <ConfirmButton onConfirm={() => revokeInviteAction(slug, i.id)} className="btn btn-ghost btn-sm text-bad" confirmLabel="Revoke?">Revoke</ConfirmButton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DeleteWorkspaceForm({ slug }: { slug: string }) {
  return (
    <ActionForm action={deleteWorkspaceAction.bind(null, slug)} className="flex flex-col gap-2 sm:flex-row">
      <input name="confirm" className="input font-mono text-[13px]" placeholder={`Type ${slug} to confirm`} aria-label="Confirm workspace address" required />
      <button type="submit" className="btn btn-danger shrink-0">Delete workspace</button>
    </ActionForm>
  );
}

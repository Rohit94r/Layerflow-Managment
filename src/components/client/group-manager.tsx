"use client";

import { Folders, Trash2 } from "lucide-react";
import { createGroupAction, deleteGroupAction } from "@/modules/portfolio/actions";
import { ActionForm, ConfirmButton, Modal, SubmitButton } from "./forms";

export function GroupManager({ slug, groups, canEdit }: { slug: string; groups: { id: string; name: string; products: number }[]; canEdit: boolean }) {
  if (!canEdit && !groups.length) return null;
  return (
    <Modal title="Product groups" triggerClassName="btn btn-secondary" trigger={<><Folders className="size-4" /> Groups</>}>
      {() => (
        <div>
          <p className="mb-4 text-ink-2">Group products by company, client or theme. Filter the portfolio by group.</p>
          <ul className="mb-4 divide-y divide-line rounded-md border border-line">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1">{g.name}</span>
                <span className="text-[12px] text-muted">{g.products} product{g.products === 1 ? "" : "s"}</span>
                {canEdit && (
                  <ConfirmButton onConfirm={() => deleteGroupAction(slug, g.id)} className="btn btn-ghost btn-sm text-bad" confirmLabel="Delete?">
                    <Trash2 className="size-3.5" />
                  </ConfirmButton>
                )}
              </li>
            ))}
            {!groups.length && <li className="px-3 py-4 text-center text-muted">No groups yet.</li>}
          </ul>
          {canEdit && (
            <ActionForm action={createGroupAction.bind(null, slug)} resetOnSuccess className="flex gap-2">
              <input name="name" className="input" placeholder="New group name" required maxLength={40} aria-label="Group name" />
              <SubmitButton>Add</SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </Modal>
  );
}

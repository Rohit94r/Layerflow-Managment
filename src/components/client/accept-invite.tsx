"use client";

import { acceptInviteAction } from "@/modules/identity/actions";
import { ActionForm, SubmitButton } from "./forms";

export function AcceptInvite({ token }: { token: string }) {
  return (
    <ActionForm action={acceptInviteAction.bind(null, token)}>
      <SubmitButton className="h-10 w-full">Accept invitation</SubmitButton>
    </ActionForm>
  );
}

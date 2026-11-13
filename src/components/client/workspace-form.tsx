"use client";

import { useEffect, useRef } from "react";
import { createWorkspaceAction } from "@/modules/identity/actions";
import { ActionForm, SubmitButton } from "./forms";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "AED", "JPY"];

export function WorkspaceForm() {
  const tzRef = useRef<HTMLInputElement>(null);
  // Prefill the browser's timezone after hydration (server render can't know it).
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tzRef.current && tzRef.current.value === "UTC") tzRef.current.value = tz;
    } catch {}
  }, []);
  return (
    <ActionForm action={createWorkspaceAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Workspace name</label>
        <input id="name" name="name" className="input" placeholder="e.g. Acme Labs" required maxLength={80} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="currency">Default currency</label>
          <select id="currency" name="currency" className="input" defaultValue="USD">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="timezone">Timezone</label>
          <input ref={tzRef} id="timezone" name="timezone" className="input" defaultValue="UTC" />
        </div>
      </div>
      <SubmitButton className="h-10 w-full">Create workspace</SubmitButton>
    </ActionForm>
  );
}

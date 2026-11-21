"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plug, RefreshCw, Unplug } from "lucide-react";
import {
  connectVercelAction, disconnectAction, mapResourceAction, refreshDeploymentsAction, refreshResourcesAction,
  removeWebhookSecretAction, setWebhookSecretAction, syncNowAction,
} from "@/modules/integrations/actions";
import { ActionButton, ActionForm, ConfirmButton, CopyField, InlineSelect, Modal, SubmitButton } from "./forms";

export function ConnectionActions({ slug, connectionId, canManage, noun = "properties", tokenBased = false }: { slug: string; connectionId: string; canManage: boolean; noun?: string; tokenBased?: boolean }) {
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton onClick={() => syncNowAction(slug, connectionId)} className="btn btn-primary btn-sm">
        <RefreshCw className="size-3.5" /> Sync now
      </ActionButton>
      <ActionButton onClick={() => refreshResourcesAction(slug, connectionId)}>Rediscover {noun}</ActionButton>
      <ConfirmButton onConfirm={() => disconnectAction(slug, connectionId, false)} confirmLabel={tokenBased ? "Delete token, keep data?" : "Revoke access, keep data?"}>
        <Unplug className="size-3.5" /> Disconnect
      </ConfirmButton>
      <ConfirmButton onConfirm={() => disconnectAction(slug, connectionId, true)} className="btn btn-danger btn-sm" confirmLabel="Delete all synced data?">
        Disconnect & delete data
      </ConfirmButton>
    </div>
  );
}

export function ResourceMapper({
  slug, resourceId, productId, products, canManage,
}: { slug: string; resourceId: string; productId: string | null; products: { id: string; name: string }[]; canManage: boolean }) {
  const options = [{ value: "", label: "Not mapped — not synced" }, ...products.map((p) => ({ value: p.id, label: p.name }))];
  if (!canManage) return <span className="text-[13px]">{options.find((o) => o.value === (productId ?? ""))?.label}</span>;
  return <InlineSelect label="Map to project" value={productId ?? ""} options={options} onSave={(v) => mapResourceAction(slug, resourceId, v)} />;
}

/** Connect (or reconnect with a new token) a Vercel account. Vercel authorises with an access token the owner creates. */
export function VercelConnect({ slug, label = "Connect", className = "btn btn-primary" }: { slug: string; label?: string; className?: string }) {
  return (
    <Modal title="Connect Vercel" triggerClassName={className} trigger={<><Plug className="size-4" /> {label}</>}>
      {(close) => (
        <ActionForm action={connectVercelAction.bind(null, slug)} onSuccess={close} className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] text-ink-2">
            <li>
              Open{" "}
              <a className="link" href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer">vercel.com/account/settings/tokens</a>{" "}
              and choose <strong>Create Token</strong>.
            </li>
            <li>Name it “Flotilla”. Set <strong>Scope</strong> to the team that owns your projects (or Full Account for a personal account), and pick an expiration.</li>
            <li>Copy the token (Vercel shows it once) and paste it below.</li>
          </ol>
          <div>
            <label className="label" htmlFor="vercel-token">Access token</label>
            <input id="vercel-token" name="token" type="password" autoComplete="off" spellCheck={false} className="input font-mono text-[13px]" required minLength={16} maxLength={512} />
          </div>
          <p className="text-[12.5px] text-muted">
            Flotilla only reads projects, deployments and domains with it. The token is encrypted at rest and never shown again. Delete it in Vercel at any time to cut access.
          </p>
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Checking token…">Connect</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

/** Optional instant updates: a Vercel team webhook pointed at this connection. */
export function VercelWebhook({
  slug, connectionId, url, configured, lastAt,
}: { slug: string; connectionId: string; url: string; configured: boolean; lastAt: string | null }) {
  return (
    <details className="rounded-md border border-line bg-sunken/40 p-3 text-[13px]" open={false}>
      <summary className="cursor-pointer font-medium text-ink">
        Instant updates (webhook){" "}
        <span className="font-normal text-muted">· {configured ? (lastAt ? `last event ${lastAt}` : "set up, no events yet") : "optional, Vercel Pro or Enterprise"}</span>
      </summary>
      <div className="mt-3 space-y-3 text-ink-2">
        <p>Without a webhook, deployments refresh every time someone opens a project, on Sync now, and on each scheduler run. With one, they update the moment Vercel builds.</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>In Vercel open <strong>Team Settings → Webhooks → Create Webhook</strong>.</li>
          <li>Events: <strong>Deployment Created, Succeeded, Error, Cancelled and Promoted</strong>. Projects: all, or the ones linked here.</li>
          <li>Endpoint URL:</li>
        </ol>
        <CopyField value={url} />
        <ol start={4} className="list-decimal space-y-1.5 pl-5">
          <li>Create it, then paste the secret Vercel shows (once) here:</li>
        </ol>
        <ActionForm action={setWebhookSecretAction.bind(null, slug, connectionId)} resetOnSuccess className="flex flex-col gap-2 sm:flex-row">
          <input name="secret" type="password" autoComplete="off" spellCheck={false} aria-label="Webhook secret" className="input font-mono text-[13px]" placeholder={configured ? "Paste a new secret to replace it" : "Webhook secret"} required />
          <SubmitButton className="shrink-0">Save secret</SubmitButton>
        </ActionForm>
        {configured && (
          <ConfirmButton onConfirm={() => removeWebhookSecretAction(slug, connectionId)} confirmLabel="Remove webhook?">Remove webhook</ConfirmButton>
        )}
        <p className="text-[12px] text-muted">The webhook needs a public https address: it can&apos;t reach localhost.</p>
      </div>
    </details>
  );
}

/** Refreshes stale deployment data once when the page opens, then re-renders with the fresh data. */
export function DeploymentsAutoRefresh({ slug, productId, stale }: { slug: string; productId: string; stale: boolean }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!stale || done.current) return;
    done.current = true;
    refreshDeploymentsAction(slug, productId)
      .then((r) => {
        if (r.ok && Number(r.data?.synced) > 0) router.refresh();
      })
      .catch(() => {});
  }, [slug, productId, stale, router]);
  return null;
}

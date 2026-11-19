"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { rotateSecretAction, saveChannelAction } from "@/modules/content/actions";
import { PUBLISH_POLICIES, postLabel } from "@/modules/content/constants";
import { ActionForm, ConfirmButton, CopyField, SubmitButton } from "./forms";

export type ChannelValues = {
  hostedEnabled: boolean; blogTitle: string; blogDescription: string; destination: "hosted" | "webhook"; webhookUrl: string | null; siteBlogUrl: string | null;
  publishPolicy: "manual" | "approval" | "auto"; indexNowEnabled: boolean; indexNowKey: string | null; weeklyAgentLimit: number; webhookSecret: string | null; hasSecret: boolean;
};

const POLICY_HELP = {
  manual: "Agents can draft. Only people with publish rights publish.",
  approval: "Agents can ask to publish; each request waits in the approvals queue with the exact post.",
  auto: "Agent publish requests go out without a per-post decision, up to the weekly limit. Every post is still logged and can be unpublished.",
} as const;

export function ChannelSettings({ slug, productId, v, hostedUrl, canEdit, canAuto }: { slug: string; productId: string; v: ChannelValues; hostedUrl: string; canEdit: boolean; canAuto: boolean }) {
  const [dest, setDest] = useState(v.destination);
  const [policy, setPolicy] = useState(v.publishPolicy);
  const [indexNow, setIndexNow] = useState(v.indexNowEnabled);
  const disabled = !canEdit;
  return (
    <ActionForm action={saveChannelAction.bind(null, slug, productId)} className="space-y-6 p-4 sm:p-5">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="label">Where posts are published</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["hosted", "webhook"] as const).map((d) => (
            <label key={d} className="flex cursor-pointer gap-3 rounded-md border border-line bg-bg p-3 has-[:checked]:border-cobalt has-[:checked]:bg-cobalt-soft">
              <input type="radio" name="destination" value={d} checked={dest === d} onChange={() => setDest(d)} className="mt-1 accent-[var(--cobalt)]" />
              <span>
                <span className="block font-medium">{postLabel(d)}</span>
                <span className="block text-[12.5px] text-muted">
                  {d === "hosted" ? "A fast, SEO-ready blog with RSS, sitemap and JSON feed. No code needed." : "Send each post (signed) to your own site or CMS. Best when the blog should live on your domain."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {dest === "hosted" ? (
        <fieldset disabled={disabled} className="space-y-4 rounded-md border border-line p-4">
          <label className="flex items-start gap-2.5">
            <input type="checkbox" name="hostedEnabled" defaultChecked={v.hostedEnabled} className="mt-1 accent-[var(--cobalt)]" />
            <span>
              <span className="block font-medium">Make the hosted blog public</span>
              <span className="block text-[12.5px] text-muted">Only published posts are visible. Turning this off hides the blog immediately.</span>
            </span>
          </label>
          <div className="text-[12.5px]">
            <div className="label">Public address</div>
            <CopyField value={hostedUrl} />
            <p className="hint">Feeds: <code className="font-mono">/rss.xml</code>, <code className="font-mono">/sitemap.xml</code>, <code className="font-mono">/feed.json</code> under this address. Submit the sitemap in Search Console so Google discovers posts.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="blogTitle">Blog title</label>
              <input id="blogTitle" name="blogTitle" defaultValue={v.blogTitle} maxLength={120} className="input" placeholder="Defaults to “<Product> blog”" />
            </div>
            <div>
              <label className="label" htmlFor="blogDescription">Blog description</label>
              <input id="blogDescription" name="blogDescription" defaultValue={v.blogDescription} maxLength={300} className="input" placeholder="Defaults to the product summary" />
            </div>
          </div>
        </fieldset>
      ) : (
        <fieldset disabled={disabled} className="space-y-4 rounded-md border border-line p-4">
          <input type="hidden" name="blogTitle" value={v.blogTitle} />
          <input type="hidden" name="blogDescription" value={v.blogDescription} />
          <div>
            <label className="label" htmlFor="webhookUrl">Webhook URL</label>
            <input id="webhookUrl" name="webhookUrl" type="url" defaultValue={v.webhookUrl ?? ""} required className="input" placeholder="https://your-site.com/api/layerflow/publish" />
            <p className="hint">Must be public https. We POST <code className="font-mono">{"{ event, post }"}</code> as JSON and only mark the post published when you answer 2xx. Reply with <code className="font-mono">{"{ \"url\": \"https://…\" }"}</code> to record the live URL.</p>
          </div>
          <div>
            <label className="label" htmlFor="siteBlogUrl">Your blog&apos;s base URL (optional)</label>
            <input id="siteBlogUrl" name="siteBlogUrl" type="url" defaultValue={v.siteBlogUrl ?? ""} className="input" placeholder="https://your-site.com/blog" />
            <p className="hint">Used for canonical links and previews when your site doesn&apos;t return a URL.</p>
          </div>
          {v.webhookSecret ? (
            <div>
              <div className="label">Signing secret</div>
              <CopyField value={v.webhookSecret} />
              <p className="hint">
                Verify <code className="font-mono">X-LayerFlow-Signature</code> = <code className="font-mono">sha256=HMAC_SHA256(secret, timestamp + &quot;.&quot; + rawBody)</code> using <code className="font-mono">X-LayerFlow-Timestamp</code>; reject requests older than 5 minutes.
              </p>
              {canEdit && (
                <div className="mt-2">
                  <ConfirmButton onConfirm={() => rotateSecretAction(slug, productId)} className="btn btn-secondary btn-sm" confirmLabel="Old secret stops working. Rotate?">Rotate secret</ConfirmButton>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted">A signing secret is created when you save.</p>
          )}
        </fieldset>
      )}
      {dest === "hosted" && <input type="hidden" name="webhookUrl" value={v.webhookUrl ?? ""} />}
      {dest === "hosted" && <input type="hidden" name="siteBlogUrl" value={v.siteBlogUrl ?? ""} />}

      <fieldset disabled={disabled} className="space-y-2">
        <legend className="label">Agent publishing policy</legend>
        {PUBLISH_POLICIES.map((p) => {
          const locked = p === "auto" && !canAuto && v.publishPolicy !== "auto";
          return (
            <label key={p} className={`flex gap-3 rounded-md border border-line bg-bg p-3 has-[:checked]:border-cobalt has-[:checked]:bg-cobalt-soft ${locked ? "opacity-60" : "cursor-pointer"}`}>
              <input type="radio" name="publishPolicy" value={p} checked={policy === p} disabled={locked} onChange={() => setPolicy(p)} className="mt-1 accent-[var(--cobalt)]" />
              <span>
                <span className="block font-medium">{postLabel(p)}{p === "approval" && <span className="ml-1.5 text-[12px] font-normal text-muted">(recommended)</span>}</span>
                <span className="block text-[12.5px] text-muted">{POLICY_HELP[p]}{locked ? " Only workspace owners and admins can turn this on." : ""}</span>
              </span>
            </label>
          );
        })}
        {policy === "auto" && (
          <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft/60 p-3 text-[12.5px] text-warn">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              Agents will publish public content under this product&apos;s name without asking. Keep the weekly limit low and check the delivery log.
              <div className="mt-2 flex items-center gap-2 text-ink">
                <label htmlFor="weeklyAgentLimit" className="text-[12.5px]">Max agent posts per 7 days</label>
                <input id="weeklyAgentLimit" name="weeklyAgentLimit" type="number" min={0} max={50} defaultValue={v.weeklyAgentLimit} className="input w-20" />
              </div>
            </div>
          </div>
        )}
        {policy !== "auto" && <input type="hidden" name="weeklyAgentLimit" value={v.weeklyAgentLimit} />}
      </fieldset>

      <fieldset disabled={disabled} className="space-y-2">
        <legend className="label">Search engine notification</legend>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="indexNowEnabled" checked={indexNow} onChange={(e) => setIndexNow(e.target.checked)} className="mt-1 accent-[var(--cobalt)]" />
          <span>
            <span className="block font-medium">Ping IndexNow when a post goes live</span>
            <span className="block text-[12.5px] text-muted">Tells Bing, Yandex, Seznam, Naver and other participating engines about new URLs. Google doesn&apos;t use IndexNow; it finds posts through your sitemap and links. Notification is not a guarantee of indexing.</span>
          </span>
        </label>
        {indexNow && (
          <div>
            <label className="label" htmlFor="indexNowKey">IndexNow key</label>
            <input id="indexNowKey" name="indexNowKey" defaultValue={v.indexNowKey ?? ""} className="input font-mono text-[13px]" placeholder="Generated on save if empty" />
            <p className="hint">
              {dest === "hosted"
                ? "Served automatically at the hosted blog's /indexnow-key.txt."
                : <>Host this key as a text file at <code className="font-mono">https://your-domain/{v.indexNowKey ?? "<key>"}.txt</code> containing only the key.</>}
            </p>
          </div>
        )}
      </fieldset>

      {canEdit && <div className="flex justify-end"><SubmitButton>Save publishing settings</SubmitButton></div>}
    </ActionForm>
  );
}

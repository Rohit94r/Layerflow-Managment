import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ProjectDeployments } from "@/modules/deploys/service";
import type { DeployState } from "@/modules/deploys/schema";
import { DeploymentsAutoRefresh } from "@/components/client/integration-panels";
import { Badge, Panel, type Tone } from "@/components/ui";
import { cn, relativeTime } from "@/lib/format";

const STATE: Record<DeployState, { tone: Tone; label: string; dot: string }> = {
  ready: { tone: "good", label: "Ready", dot: "bg-good" },
  error: { tone: "bad", label: "Failed", dot: "bg-bad" },
  building: { tone: "cobalt", label: "Building", dot: "bg-cobalt animate-pulse" },
  queued: { tone: "neutral", label: "Queued", dot: "bg-muted" },
  canceled: { tone: "outline", label: "Canceled", dot: "bg-line-strong" },
  blocked: { tone: "warn", label: "Blocked", dot: "bg-warn" },
};

/** Vercel deployments for one product: what's live, the latest production build and recent activity. */
export function DeploymentsPanel({
  slug, productId, projects, integrationsHref, canManage, vercelConnected,
}: {
  slug: string; productId: string; projects: ProjectDeployments[]; integrationsHref: string; canManage: boolean; vercelConnected: boolean;
}) {
  if (!projects.length) {
    if (!canManage) return null;
    return (
      <Panel title="Deployments">
        <p className="px-4 py-3 text-[13px] text-muted">
          {vercelConnected ? "No Vercel project is linked yet. " : "See this project's Vercel deployments here. "}
          <Link href={integrationsHref} className="link">{vercelConnected ? "Link its project" : "Connect Vercel"}</Link>
        </p>
      </Panel>
    );
  }
  // Stale data is refreshed once, quietly, by the client after the page renders.
  const stale = projects.some((p) => p.stale);
  return (
    <>
      <DeploymentsAutoRefresh slug={slug} productId={productId} stale={stale} />
      {projects.map((p) => (
        <Panel
          key={p.id}
          title={projects.length > 1 ? <span className="flex min-w-0 items-center gap-2">Deployments <span className="truncate font-sans text-[13px] text-muted">· {p.name}</span></span> : "Deployments"}
          action={p.dashboardUrl ? <a href={p.dashboardUrl} target="_blank" rel="noreferrer" className="link inline-flex shrink-0 items-center gap-1 text-[12.5px]">Vercel <ExternalLink className="size-3" /></a> : undefined}
        >
          {p.connectionStatus === "needs_reauth" && (
            <p className="border-b border-line bg-bad-soft px-4 py-2 text-[12.5px] text-bad">
              The Vercel token stopped working, so this may be out of date. <Link href={integrationsHref} className="underline">Paste a new token</Link>
            </p>
          )}
          <Production p={p} />
          {p.recent.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {p.recent.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5 px-4 py-2 text-[12.5px]">
                  <span className={cn("size-2 shrink-0 rounded-full", STATE[d.state].dot)} title={STATE[d.state].label} aria-label={STATE[d.state].label} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{d.commitMessage || (d.target === "production" ? "Production deployment" : "Preview deployment")}</span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {d.target === "production" ? "Production" : "Preview"}
                      {d.branch && <> · <span className="font-mono">{d.branch}</span></>}
                      {d.author && <> · {d.author}</>} · {relativeTime(d.createdAt)}
                    </span>
                  </span>
                  {(d.inspectorUrl ?? d.url) && (
                    <a href={d.inspectorUrl ?? d.url ?? undefined} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm shrink-0 px-1.5" aria-label="Open in Vercel" title="Open in Vercel">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-4 py-2 text-[11.5px] text-muted">
            {p.lastSyncAt ? `Synced ${relativeTime(p.lastSyncAt)}` : "Not synced yet"}
            {p.repo && <> · {p.repoUrl ? <a href={p.repoUrl} target="_blank" rel="noreferrer" className="link">{p.repo}</a> : p.repo}</>}
            {p.framework && <> · {p.framework}</>}
          </p>
        </Panel>
      ))}
    </>
  );
}

function Production({ p }: { p: ProjectDeployments }) {
  const latest = p.latestProduction;
  if (!latest) {
    return <p className="px-4 py-3 text-[13px] text-muted">No production deployment yet{p.productionBranch ? `: push to ${p.productionBranch} to ship one` : ""}.</p>;
  }
  const s = STATE[latest.state];
  const servingOlder = latest.state !== "ready" && p.live && p.live.id !== latest.id;
  return (
    <div className="space-y-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">Production</span>
        <Badge tone={s.tone}>{s.label}</Badge>
        {p.domain && (
          <a href={`https://${p.domain}`} target="_blank" rel="noreferrer" className="link min-w-0 truncate text-[13px]">{p.domain}</a>
        )}
      </div>
      <p className="text-[12.5px] text-ink-2">
        {latest.commitMessage ? <>“{latest.commitMessage}”</> : "Deployment"}
        {latest.branch && <> on <span className="font-mono">{latest.branch}</span></>} · {relativeTime(latest.createdAt)}
      </p>
      {latest.state === "error" && (
        <p className="rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
          The latest production build failed{latest.errorMessage ? `: ${latest.errorMessage}` : "."}{" "}
          {latest.inspectorUrl && <a href={latest.inspectorUrl} target="_blank" rel="noreferrer" className="underline">Build logs</a>}
        </p>
      )}
      {servingOlder && (
        <p className="text-[12px] text-muted">Still serving the deployment from {relativeTime(p.live!.createdAt)}{p.live!.commitMessage ? ` (“${p.live!.commitMessage}”)` : ""}.</p>
      )}
    </div>
  );
}

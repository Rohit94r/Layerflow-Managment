import Link from "next/link";
import { CheckCircle2, Plug } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { catalog, listConnections } from "@/modules/integrations/service";
import { productOptions } from "@/modules/portfolio/service";
import { ConnectionActions, ResourceMapper } from "@/components/client/integration-panels";
import { FreshnessBadge, connectionState } from "@/components/freshness";
import { Badge, NoAccess, PageHeader, Panel } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/format";
import { redirectUri } from "@/integrations/providers/google-search-console";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/integrations">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "integration.view")) return <NoAccess what="integrations" />;
  const canManage = can(ctx, "integration.manage");
  const [connections, products] = await Promise.all([listConnections(ctx), productOptions(ctx)]);
  const cat = catalog();

  return (
    <>
      <PageHeader title="Integrations" description="Connect the tools you already use. Every connection shows its scopes, freshness and errors, and can be disconnected with its data deleted." />

      {typeof sp.error === "string" && (
        <p role="alert" className="mb-5 rounded-md border border-bad/40 bg-bad-soft px-4 py-2.5 text-[13.5px] text-bad">{sp.error}</p>
      )}
      {sp.connected === "1" && (
        <p className="mb-5 flex items-center gap-2 rounded-md border border-good/40 bg-good-soft px-4 py-2.5 text-[13.5px] text-good">
          <CheckCircle2 className="size-4" /> Connected. Map each property to a product below; only mapped properties are synced.
        </p>
      )}

      {connections.length > 0 && (
        <div className="mb-8 space-y-5">
          {connections.map((c) => {
            const state = connectionState(c.status, c.lastSuccessAt, c.lastSyncAt);
            return (
              <Panel
                key={c.id}
                title={<span className="flex items-center gap-2">Google Search Console <span className="font-sans text-[13px] text-muted">· {c.accountLabel || "Google account"}</span></span>}
                action={<FreshnessBadge state={state} at={c.lastSuccessAt} />}
              >
                <div className="space-y-4 p-4">
                  {c.lastError && state !== "fresh" && (
                    <p className="rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-[13px] text-bad">
                      Last error: {c.lastError}
                      {c.status === "needs_reauth" && canManage && (
                        <> — <a className="underline" href={`/api/integrations/google_search_console/start?workspace=${ctx.workspaceSlug}`}>Reconnect</a></>
                      )}
                    </p>
                  )}
                  <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[140px_1fr]">
                    <dt className="text-muted">Scopes granted</dt>
                    <dd className="font-mono text-[12px]">{c.scopes.map((s) => s.replace("https://www.googleapis.com/auth/", "")).join(", ")}</dd>
                    <dt className="text-muted">Connected</dt>
                    <dd>{formatDate(c.createdAt)}</dd>
                    <dt className="text-muted">Last successful sync</dt>
                    <dd>{c.lastSuccessAt ? relativeTime(c.lastSuccessAt) : "Never"}</dd>
                  </dl>

                  <div>
                    <div className="eyebrow mb-2">Properties</div>
                    {c.resources.length ? (
                      <div className="overflow-x-auto rounded-md border border-line">
                        <table className="table min-w-[560px]">
                          <thead><tr><th>Property</th><th>Product</th><th>Data through</th><th>Last sync</th></tr></thead>
                          <tbody>
                            {c.resources.map((r) => (
                              <tr key={r.id}>
                                <td className="font-mono text-[12.5px]">{r.externalId}</td>
                                <td><ResourceMapper slug={ctx.workspaceSlug} resourceId={r.id} productId={r.productId} products={products} canManage={canManage} /></td>
                                <td className="text-[13px]">{r.dataThrough ? formatDate(r.dataThrough) : <span className="text-muted">—</span>}</td>
                                <td className="text-[13px] text-muted">{r.lastSyncAt ? relativeTime(r.lastSyncAt) : "Never"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[13px] text-muted">No verified properties found for this Google account. Verify your site in Search Console, then rediscover.</p>
                    )}
                  </div>

                  {c.runs.length > 0 && (
                    <details className="text-[13px]">
                      <summary className="cursor-pointer text-ink-2">Sync history ({c.runs.length})</summary>
                      <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                        {c.runs.map((r) => (
                          <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-1.5">
                            <Badge tone={r.status === "succeeded" ? "good" : r.status === "running" ? "cobalt" : "bad"}>{r.status}</Badge>
                            <span className="text-muted">{r.trigger}</span>
                            <span>{r.recordsWritten} records</span>
                            {r.error && <span className="text-bad">{r.error}</span>}
                            <span className="ml-auto text-muted">{relativeTime(r.startedAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <ConnectionActions slug={ctx.workspaceSlug} connectionId={c.id} canManage={canManage} />
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-xl">Catalog</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {cat.map((e) => (
          <div key={e.id} className="panel flex flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-serif text-lg">{e.name}</div>
                <div className="text-[12px] text-muted">{e.category}</div>
              </div>
              {e.state === "planned" ? <Badge tone="outline">Planned</Badge> : e.configured ? <Badge tone="good">Available</Badge> : <Badge tone="warn">Needs server setup</Badge>}
            </div>
            <p className="mt-2 text-ink-2">{e.description}</p>
            {e.state === "available" && (
              <div className="mt-3 space-y-2 text-[12.5px]">
                <p><span className="text-muted">Why:</span> {e.purpose}</p>
                <ul className="space-y-1">
                  {e.scopes.map((s) => <li key={s.scope}><code className="rounded bg-sunken px-1 font-mono text-[11.5px]">{s.scope}</code> — {s.why}</li>)}
                </ul>
                <p><span className="text-muted">Stored:</span> {e.dataStored}</p>
                <p><span className="text-muted">Sync:</span> {e.sync}</p>
              </div>
            )}
            <div className="mt-4">
              {e.state === "available" && e.configured && canManage && (
                <a href={`/api/integrations/${e.id}/start?workspace=${ctx.workspaceSlug}`} className="btn btn-primary">
                  <Plug className="size-4" /> {connections.length ? "Connect another account" : "Connect"}
                </a>
              )}
              {e.state === "available" && !e.configured && (
                <div className="rounded-md border border-line bg-sunken p-3 text-[12.5px] text-ink-2">
                  An administrator must create a Google OAuth client (Web application) and set <code className="font-mono">{e.envVars.join(", ")}</code> on the server.
                  Authorised redirect URI: <code className="break-all font-mono">{redirectUri()}</code>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-muted">
        Planned connectors are listed for transparency; they are not available yet. See <Link className="link" href={`/w/${ctx.workspaceSlug}/seo`}>SEO</Link> for Search Console data.
      </p>
    </>
  );
}

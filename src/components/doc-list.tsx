import Link from "next/link";
import { docLabel } from "@/modules/knowledge/constants";
import { Badge, EmptyState } from "@/components/ui";
import { formatDate, relativeTime, today } from "@/lib/format";

type Doc = {
  id: string; title: string; kind: string; status: string; revisitDate: string | null;
  productName: string | null; updatedAt: Date; editorName: string | null;
};

export function DocList({ slug, docs, emptyAction, showProduct = true }: { slug: string; docs: Doc[]; emptyAction?: React.ReactNode; showProduct?: boolean }) {
  if (!docs.length)
    return (
      <div className="panel">
        <EmptyState title="No documents yet" action={emptyAction}>
          Write PRDs, runbooks, meeting notes and decision records. Decisions get a revisit date so they don&apos;t silently go stale.
        </EmptyState>
      </div>
    );
  return (
    <div className="panel divide-y divide-line">
      {docs.map((d) => (
        <Link key={d.id} href={`/w/${slug}/docs/${d.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-sunken/60 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{d.title}</div>
            <div className="text-[12.5px] text-muted">
              {showProduct && (d.productName ?? "Workspace")} {showProduct && "·"} edited {relativeTime(d.updatedAt)}
              {d.editorName && ` by ${d.editorName}`}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {d.kind === "decision" && d.revisitDate && (
              <Badge tone={d.revisitDate <= today() ? "warn" : "outline"}>Revisit {formatDate(d.revisitDate, { month: "short", day: "numeric" })}</Badge>
            )}
            <Badge tone={d.status === "active" ? "good" : d.status === "draft" ? "neutral" : "outline"}>{docLabel(d.status)}</Badge>
            <Badge tone={d.kind === "decision" ? "cobalt" : "neutral"}>{docLabel(d.kind)}</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}

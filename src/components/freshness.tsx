import { Badge } from "@/components/ui";
import { relativeTime } from "@/lib/format";

/**
 * The seven data states from master prompt §0.2 rule 6, rendered consistently:
 * value, unknown, not connected, not authorised, stale, partial, failed.
 */
export type DataState = "fresh" | "stale" | "partial" | "failed" | "not_connected" | "not_authorized" | "unknown";

export function connectionState(status: string | null | undefined, lastSuccessAt: Date | null | undefined, lastSyncAt?: Date | null): DataState {
  if (!status) return "not_connected";
  if (status === "needs_reauth") return "not_authorized";
  if (status === "error") return "failed";
  if (status === "revoked") return "not_connected";
  if (!lastSuccessAt) return lastSyncAt ? "failed" : "unknown";
  return Date.now() - lastSuccessAt.getTime() > 48 * 3600 * 1000 ? "stale" : "fresh";
}

const MAP: Record<DataState, { tone: "good" | "warn" | "bad" | "outline" | "neutral"; label: string }> = {
  fresh: { tone: "good", label: "Fresh" },
  stale: { tone: "warn", label: "Stale" },
  partial: { tone: "warn", label: "Partial" },
  failed: { tone: "bad", label: "Sync failed" },
  not_connected: { tone: "outline", label: "Not connected" },
  not_authorized: { tone: "bad", label: "Reconnect needed" },
  unknown: { tone: "neutral", label: "Not synced yet" },
};

export function FreshnessBadge({ state, at }: { state: DataState; at?: Date | null }) {
  const m = MAP[state];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={m.tone}>
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
        {m.label}
      </Badge>
      {at && <span className="text-[12px] text-muted">synced {relativeTime(at)}</span>}
    </span>
  );
}

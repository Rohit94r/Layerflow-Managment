/**
 * Deterministic SEO opportunity rules. Pure functions over Search Console rows so they are
 * testable and explainable. Each insight carries its evidence, period, confidence and next action.
 */
export type DimRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };

export type DraftInsight = {
  kind: "low_ctr" | "striking_distance" | "declining_page" | "declining_query";
  key: string;
  title: string;
  evidence: Record<string, string | number>;
  confidence: "high" | "medium" | "low";
  nextAction: string;
};

export const THRESHOLDS = {
  lowCtrMinImpressions: 200,
  lowCtrMaxPosition: 10,
  strikingMin: 8,
  strikingMax: 20,
  strikingMinImpressions: 100,
  declineMinPrevClicks: 20,
  declineRatio: 0.3,
};

/** Rough expected CTR by position band, used only to flag clear under-performance. */
function expectedCtr(position: number) {
  if (position <= 1.5) return 0.2;
  if (position <= 3) return 0.1;
  if (position <= 5) return 0.05;
  return 0.025;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pos = (n: number) => n.toFixed(1);

export function detectInsights(input: { queries: DimRow[]; pages: DimRow[]; prevQueries: DimRow[]; prevPages: DimRow[]; period: string }): DraftInsight[] {
  const t = THRESHOLDS;
  const out: DraftInsight[] = [];

  for (const q of input.queries) {
    const exp = expectedCtr(q.position);
    if (q.impressions >= t.lowCtrMinImpressions && q.position <= t.lowCtrMaxPosition && q.ctr < exp / 2) {
      out.push({
        kind: "low_ctr",
        key: q.key,
        title: `High impressions, low CTR for “${q.key}”`,
        evidence: { impressions: q.impressions, clicks: q.clicks, ctr: pct(q.ctr), position: pos(q.position), expectedCtrAtPosition: `~${pct(exp)}`, period: input.period },
        confidence: q.impressions >= 1000 ? "high" : "medium",
        nextAction: "Rewrite the title and meta description of the ranking page to match the query's intent, then compare CTR after 28 days.",
      });
    }
    if (q.position >= t.strikingMin && q.position <= t.strikingMax && q.impressions >= t.strikingMinImpressions) {
      out.push({
        kind: "striking_distance",
        key: q.key,
        title: `“${q.key}” ranks just off page one (position ${pos(q.position)})`,
        evidence: { impressions: q.impressions, clicks: q.clicks, position: pos(q.position), period: input.period },
        confidence: q.impressions >= 500 ? "medium" : "low",
        nextAction: "Strengthen the ranking page for this query: expand coverage of the topic and add internal links from related pages.",
      });
    }
  }

  const decline = (cur: DimRow[], prev: DimRow[], kind: "declining_page" | "declining_query", noun: string) => {
    const now = new Map(cur.map((r) => [r.key, r]));
    for (const p of prev) {
      if (p.clicks < t.declineMinPrevClicks) continue;
      const c = now.get(p.key)?.clicks ?? 0;
      const drop = (p.clicks - c) / p.clicks;
      if (drop >= t.declineRatio) {
        out.push({
          kind,
          key: p.key,
          title: `${noun} clicks down ${Math.round(drop * 100)}%: ${p.key}`,
          evidence: { clicksPrevious28d: p.clicks, clicksLast28d: c, change: `-${Math.round(drop * 100)}%`, positionPrevious: pos(p.position), positionNow: now.get(p.key) ? pos(now.get(p.key)!.position) : "not in top results", period: input.period },
          confidence: p.clicks >= 100 ? "high" : "medium",
          nextAction:
            kind === "declining_page"
              ? "Check the page for recent changes, indexing problems or a competing page; refresh the content if it is out of date."
              : "Check which page ranks for this query now and whether search intent changed; update the target page.",
        });
      }
    }
  };
  decline(input.pages, input.prevPages, "declining_page", "Page");
  decline(input.queries, input.prevQueries, "declining_query", "Query");

  // Keep the list focused: strongest evidence first, capped.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.confidence] - rank[b.confidence]).slice(0, 60);
}

/**
 * First-party agent catalog. Every listed agent exists in this codebase; each is
 * independently scoped, permissioned and budgeted (no unrestricted super-agent).
 */
export type ToolLevel = "read" | "create_internal" | "approval";

export type AgentDefinition = {
  key: string;
  name: string;
  version: string;
  publisher: string;
  summary: string;
  useCase: string;
  defaultTools: string[];
  optionalTools: string[];
  defaultInstructions: string;
  task: string;
  dataAccess: string;
  suggestedSchedule: "manual" | "daily" | "weekly";
};

export const AGENT_CATALOG: AgentDefinition[] = [
  {
    key: "portfolio_analyst",
    name: "Portfolio Analyst",
    version: "1.0.0",
    publisher: "LayerFlow (first-party)",
    summary: "Weekly review of every product: what changed, what needs attention, and the evidence behind it.",
    useCase: "Replace the manual Monday review. Produces a draft report with recommendations (Invest, Maintain, Experiment, Reduce cost, Improve reliability, Pause, Review sunset) and proposes tasks for approval.",
    defaultTools: ["list_products", "get_product", "list_tasks", "list_activity", "finance_summary", "seo_overview", "list_seo_insights", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Focus on the products in Current focus and anything marked at risk. Be concise.",
    task: "Review the portfolio. Identify the products that need attention and why, the biggest risks and opportunities, and recommend one next action per product. Write the result as a report.",
    dataAccess: "Reads products, tasks, activity, finance and SEO data in this workspace. Writes draft reports. Never sends anything outside the workspace.",
    suggestedSchedule: "weekly",
  },
  {
    key: "seo_analyst",
    name: "SEO Analyst",
    version: "1.0.0",
    publisher: "LayerFlow (first-party)",
    summary: "Turns Search Console data and opportunities into a prioritised SEO plan.",
    useCase: "Explains traffic changes with evidence from Search Console and proposes concrete SEO tasks for approval.",
    defaultTools: ["list_products", "seo_overview", "list_seo_insights", "list_tasks", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Prioritise opportunities with the most impressions. Never promise rankings or indexing.",
    task: "Analyse search performance and open SEO opportunities. Explain what changed versus the previous period, rank the opportunities by expected impact, and write an SEO plan as a report.",
    dataAccess: "Reads Search Console data synced into this workspace, products and tasks. Writes draft reports.",
    suggestedSchedule: "weekly",
  },
  {
    key: "engineering_triage",
    name: "Engineering Triage",
    version: "1.0.0",
    publisher: "LayerFlow (first-party)",
    summary: "Reviews open bugs and overdue work and suggests what to fix first.",
    useCase: "Triage for solo founders: groups duplicate-looking bugs, flags stale work, and proposes next tasks.",
    defaultTools: ["list_products", "list_tasks", "get_product", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Prefer fixing urgent bugs on live products before feature work.",
    task: "Triage open bugs and overdue tasks. Group related items, flag anything stale, and recommend the order to work in. Write the result as a report.",
    dataAccess: "Reads products and tasks. Writes draft reports.",
    suggestedSchedule: "daily",
  },
  {
    key: "finance_monitor",
    name: "Finance Monitor",
    version: "1.0.0",
    publisher: "LayerFlow (first-party)",
    summary: "Watches costs, renewals and recorded revenue; flags waste and upcoming charges.",
    useCase: "Monthly cost review across products with renewals to decide on and costs to cut.",
    defaultTools: ["list_products", "finance_summary", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Never convert currencies. Call out estimated amounts and missing revenue data.",
    task: "Review costs, renewals and recorded revenue per product. Flag upcoming renewals, likely waste and products whose cost is out of line with their stage. Write the result as a report.",
    dataAccess: "Reads finance data and products. Writes draft reports.",
    suggestedSchedule: "weekly",
  },
];

export const agentDef = (key: string) => AGENT_CATALOG.find((a) => a.key === key);

/** List prices (USD per million tokens) used to estimate run cost from reported token usage. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};

export function costMicros(model: string, input: number, output: number) {
  const [i, o] = PRICES[model] ?? [8, 40]; // unknown model: price conservatively
  return Math.round(input * i + output * o); // tokens × $/MTok = micro-dollars
}

export const AGENT_MODEL = () => process.env.AGENT_MODEL || "claude-opus-5-5";
export const agentsConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

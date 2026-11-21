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
  /** How the run should end. Defaults to writing one report. */
  finish?: string;
  /** Extra rules appended to the system prompt for this agent. */
  rules?: string[];
};

const REPORT_FINISH = "Finish by calling write_report once with a concise Markdown report (headings, bullet points, one recommended next action per item), then reply with a two-sentence summary.";

export const AGENT_CATALOG: AgentDefinition[] = [
  {
    key: "portfolio_analyst",
    name: "Portfolio Analyst",
    version: "1.0.0",
    publisher: "Flotilla (first-party)",
    summary: "Weekly review of every project: what changed, what needs attention, and the evidence behind it.",
    useCase: "Replace the manual Monday review. Produces a draft report with recommendations (Invest, Maintain, Experiment, Reduce cost, Improve reliability, Pause, Review sunset) and proposes tasks for approval.",
    defaultTools: ["list_products", "get_product", "list_tasks", "list_activity", "finance_summary", "seo_overview", "list_seo_insights", "get_analytics", "list_content", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Focus on the products in Current focus and anything marked at risk. Be concise.",
    task: "Review the portfolio. Identify the products that need attention and why, the biggest risks and opportunities, and recommend one next action per product. Write the result as a report.",
    dataAccess: "Reads projects, tasks, activity, finance and SEO data in this workspace. Writes draft reports. Never sends anything outside the workspace.",
    suggestedSchedule: "weekly",
  },
  {
    key: "seo_analyst",
    name: "SEO Analyst",
    version: "1.0.0",
    publisher: "Flotilla (first-party)",
    summary: "Turns Search Console data and opportunities into a prioritised SEO plan.",
    useCase: "Explains traffic changes with evidence from Search Console and proposes concrete SEO tasks for approval.",
    defaultTools: ["list_products", "seo_overview", "list_seo_insights", "get_analytics", "list_content", "list_tasks", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Prioritise opportunities with the most impressions. Never promise rankings or indexing.",
    task: "Analyse search performance and open SEO opportunities. Explain what changed versus the previous period, rank the opportunities by expected impact, and write an SEO plan as a report.",
    dataAccess: "Reads Search Console data synced into this workspace, projects and tasks. Writes draft reports.",
    suggestedSchedule: "weekly",
  },
  {
    key: "engineering_triage",
    name: "Engineering Triage",
    version: "1.0.0",
    publisher: "Flotilla (first-party)",
    summary: "Reviews open bugs and overdue work and suggests what to fix first.",
    useCase: "Triage for solo founders: groups duplicate-looking bugs, flags stale work, and proposes next tasks.",
    defaultTools: ["list_products", "list_tasks", "get_product", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Prefer fixing urgent bugs on live products before feature work.",
    task: "Triage open bugs and overdue tasks. Group related items, flag anything stale, and recommend the order to work in. Write the result as a report.",
    dataAccess: "Reads projects and tasks. Writes draft reports.",
    suggestedSchedule: "daily",
  },
  {
    key: "finance_monitor",
    name: "Finance Monitor",
    version: "1.0.0",
    publisher: "Flotilla (first-party)",
    summary: "Watches costs, renewals and recorded revenue; flags waste and upcoming charges.",
    useCase: "Monthly cost review across projects with renewals to decide on and costs to cut.",
    defaultTools: ["list_products", "finance_summary", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Never convert currencies. Call out estimated amounts and missing revenue data.",
    task: "Review costs, renewals and recorded revenue per product. Flag upcoming renewals, likely waste and products whose cost is out of line with their stage. Write the result as a report.",
    dataAccess: "Reads finance data and projects. Writes draft reports.",
    suggestedSchedule: "weekly",
  },
  {
    key: "content_writer",
    name: "Content Writer",
    version: "1.0.0",
    publisher: "Flotilla (first-party)",
    summary: "Researches your Search Console opportunities and existing posts, then writes SEO blog drafts for one project and (optionally) asks to publish them.",
    useCase: "Keeps every project's blog moving without you writing each post. Drafts land in the Content Studio with an SEO score. With request_publish enabled, the project's publishing policy decides whether a person approves each post or it goes out automatically within a weekly limit.",
    defaultTools: ["list_products", "get_product", "seo_overview", "list_seo_insights", "list_content", "draft_blog_post", "update_blog_post"],
    optionalTools: ["get_analytics", "request_publish"],
    defaultInstructions: "Write for the product's target audience in plain, practical English. One post per run.",
    task: "Pick the single most valuable blog topic for the product in scope: prefer an open Search Console opportunity (striking-distance or low-CTR query) that no existing post already targets; otherwise a question the product's audience searches for. Write one complete, original, genuinely helpful post and save it as a draft. Improve it until the SEO score is at least 75. If request_publish is available and the post meets the bar, request publishing.",
    dataAccess: "Reads projects, Search Console data, analytics (if enabled) and existing posts. Writes draft posts. Publishing follows the project's policy and is recorded in the delivery log.",
    suggestedSchedule: "weekly",
    finish: "Finish after saving the post (and requesting publishing if allowed). Reply with two sentences: the topic and keyword you chose with the evidence behind it, and the post's status.",
    rules: [
      "Writing rules: original content only; no copied text. Never invent statistics, studies, quotes, customer names, testimonials, prices, integrations or features. Only state facts about the product that appear in get_product. If something is unknown, write around it; never leave placeholders like [TODO] or [insert].",
      "Structure: a direct answer in the first paragraph that includes the target keyword; ## sections; short paragraphs (under 120 words); average sentence under 20 words; a practical example or checklist; a closing section that links to the product URL from get_product. Aim for 1,000–1,600 words.",
      "Metadata: meta_title 30–60 characters with the keyword near the start; meta_description 120–160 characters that earns the click; excerpt one or two sentences.",
      "Never request publishing for a post with an SEO score under 70 or with any claim you could not verify from tool data.",
    ],
  },
  {
    key: "growth_analyst",
    name: "Growth Analyst",
    version: "1.0.0",
    publisher: "Flotilla (first-party)",
    summary: "Combines Google Analytics, Search Console and your content pipeline into a weekly growth review per project.",
    useCase: "Answers ‘which projects are growing, which are slipping, and what should I do this week?’ with evidence: traffic and key-event changes, channels, landing pages, search queries and publishing cadence.",
    defaultTools: ["list_products", "get_product", "get_analytics", "seo_overview", "list_seo_insights", "list_content", "list_tasks", "write_report"],
    optionalTools: ["propose_task"],
    defaultInstructions: "Rank products by the size of the change, not by name. Keep it to one page.",
    task: "Review growth for every product in scope: traffic, key events and engagement from Google Analytics; clicks and queries from Search Console; publishing cadence from the content pipeline. Say what changed versus the previous 28 days and the most likely drivers supported by the data (channel, landing page, query or post). Recommend at most three actions per product. Write the result as a report.",
    dataAccess: "Reads analytics, Search Console data, projects, posts and tasks. Writes draft reports. Can propose tasks for approval.",
    suggestedSchedule: "weekly",
    rules: ["Only call something a cause when a specific channel, page, query or post accounts for the change in the data; otherwise call it a hypothesis. If analytics is not connected, say so and do not estimate traffic."],
  },
];

export const finishInstruction = (d: AgentDefinition) => d.finish ?? REPORT_FINISH;

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

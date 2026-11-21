# New Features — Growth Engine, Content Autopilot, Mobile

**Updated:** 19 November 2026
**Scope:** Everything added on top of [product-os-master-prompt-v3.md](product-os-master-prompt-v3.md). The master prompt still wins on product intent; [BUILD.md](BUILD.md) wins on implementation detail.
**Goal:** Run 7–9 products (and let other founders run theirs) from one place: see what's growing, publish content, let agents do the repetitive growth work, and act from a phone.

Each feature has a tag and a state:

- **Tag:** `CORE` (needed for the daily loop), `V1` (next), `V2` (later), `LATER`, `OPTIONAL`.
- **State:** **Shipped** (in the code and tested), **Proposed** (designed, not built) or **Deferred**.

Nothing marked Proposed exists yet. Don't assume it does.

---

## 1. What shipped in this change

### 1.1 Content Studio and blog engine (`CORE`, Shipped)

| Capability | Details |
|---|---|
| Posts per product | Title, slug, excerpt, Markdown body, target and secondary keywords, search intent, funnel stage, SEO title, meta description, canonical URL, cover image, author, tags. |
| Editorial workflow | `idea → draft → in_review → approved → scheduled → published → archived`. Transitions are validated on the server. Only publishers can approve, schedule, publish or edit approved and live posts. |
| Live SEO score | A deterministic 0–100 score with 16 explained checks: keyword in title, intro, H2 and slug; keyword density and stuffing; title and meta length; depth; headings; single H1; links; image alt text; sentence and paragraph length; excerpt. It runs as you type and is cached on save. It is labelled as a writing aid, not a ranking prediction. |
| Editor | Write / Preview tabs, search-result preview, word count and reading time, Ctrl+S to save, an unsaved-changes guard, and a sticky Save button that sits above the phone tab bar. |
| Calendar | Two weeks back and four weeks ahead, grouped by day, per workspace or per product. |
| Scheduling | Pick a local time; it is stored as an exact instant. The scheduler publishes due posts. If a scheduled publish fails, the post goes back to "approved" and the scheduler alerts whoever scheduled it, so it never retries forever. |
| Delivery log | Every attempt (hosted, webhook, IndexNow) is recorded with its status, HTTP code and actor. A post counts as published only after the destination confirms it. |

### 1.2 Publishing destinations (`CORE`, Shipped)

- **Hosted blog**, per product, at `/blog/<workspace>/<product>`. It is off by default; the owner switches it on.
  - Index page plus post pages with canonical URLs, Open Graph, Twitter cards, `BlogPosting` and `BreadcrumbList` JSON-LD, related posts, and a reading-first mobile layout in the product's brand colour.
  - `rss.xml`, `sitemap.xml` and `feed.json` (JSON Feed 1.1, CORS-enabled, so your own sites can *pull* posts) and `indexnow-key.txt`.
  - Only published posts of products with the blog switched on are ever public. Switching it off hides everything immediately.
- **Webhook to your own site.** Each published post is POSTed as JSON, signed with HMAC-SHA256: `X-Flotilla-Signature: sha256=…` over `` `${timestamp}.${body}` `` with `X-Flotilla-Timestamp`.
  - Only a 2xx response marks the post published. Reply `{ "url": "https://…" }` to record the live URL.
  - Unpublishing sends `content.unpublished`.
  - The signing secret is encrypted at rest and can be rotated. Requests go through the SSRF guard: public https only, no redirects.
- **IndexNow ping** on publish (optional). It notifies Bing, Yandex, Seznam, Naver and other participating engines. **Google does not use IndexNow.** Google discovers posts through the sitemap: submit it in Search Console. The ping is skipped and logged when the URL isn't public https (for example on localhost).

**Receiving posts in a Next.js site** (route handler sketch):

```ts
// app/api/flotilla/publish/route.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export async function POST(req: Request) {
  const raw = await req.text();
  const ts = req.headers.get("x-flotilla-timestamp") ?? "";
  const sig = req.headers.get("x-flotilla-signature") ?? "";
  const expected = `sha256=${createHmac("sha256", process.env.FLOTILLA_SECRET!).update(`${ts}.${raw}`).digest("hex")}`;
  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
  if (!fresh || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return new Response("bad signature", { status: 401 });
  }
  const { event, post } = JSON.parse(raw);
  // event: "content.published" | "content.unpublished"
  // Save (or delete) post.bodyMarkdown in your CMS / database / repo here, then refresh the cached pages:
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  return Response.json({ url: `https://your-site.com/blog/${post.slug}` });
}
```

Add `import { revalidatePath } from "next/cache";` at the top, and set `FLOTILLA_SECRET` (the channel's signing secret) in that site's Vercel environment variables. Put the route's public URL (for example `https://your-site.com/api/flotilla/publish`) in the product's Content → Publishing settings.

### 1.3 Agents that write and publish (`CORE`, Shipped)

- **Content Writer** (new):
  - Picks the most valuable topic: an open Search Console opportunity no existing post targets, or else an audience question.
  - Writes one original post, saves it as a draft, and revises it until the SEO score is at least 75.
  - Can then request publishing.
  - Hard rules: no invented stats, quotes, customers, prices or features; no placeholders; product facts only from product data.
- **Growth Analyst** (new): a weekly growth review per product from GA4, Search Console and the content pipeline. It names causes only when a channel, page, query or post accounts for the change; otherwise it calls them hypotheses.
- **New tools:**

  | Tool | Kind |
  |---|---|
  | `get_analytics` | Read |
  | `list_content` | Read |
  | `draft_blog_post` | Draft only |
  | `update_blog_post` | Draft only; this agent's own drafts |
  | `request_publish` | Policy-gated |

- **Updated agents:** Portfolio Analyst and SEO Analyst now also read analytics and content.
- **Publish policy per product** (master prompt rule 9: approval or an explicitly configured policy):
  - **Manual**: agents draft; a person publishes.
  - **Approval** (default): each agent publish request goes to the approvals queue. The approval card links to the post.
  - **Auto**: agent posts are scheduled or published without a per-post decision, within a **weekly limit** (default 3). Only owners and admins can switch this on, and the change is audited.
- Agents can't touch other agents' or people's posts, or posts of a product outside their scope. Tool calls are re-authorised at execution time against the owner's role.
- The run timeline gives plain-language step summaries such as "Saved draft post … (SEO score 82)", "Requested approval to publish" or "Published post: <url>".

### 1.4 Google Analytics 4 integration (`CORE`, Shipped)

- Shares one Google OAuth client with Search Console. It uses the read-only `analytics.readonly` scope, PKCE plus a signed state, and encrypted tokens.
- Property discovery through the Admin API `accountSummaries`. Properties are mapped explicitly to products; nothing is attributed automatically.
- The daily sync (Data API `runReport`) stores:
  - 90 days of sessions, users, new users, page views, engaged sessions and key events;
  - channel, landing-page, device and source breakdowns for the current and previous 28 days.
- Engagement rate is recomputed from engaged sessions, never by averaging rates. Users are labelled "daily users, summed".
- Freshness, needs-reauth and failure states reuse the existing connection lifecycle. Disconnecting revokes access at Google.

### 1.5 Growth dashboard (`CORE`, Shipped)

- **`/w/<ws>/growth`**:
  - Portfolio totals for sessions, key events, search clicks and posts, each with % change against the previous period.
  - **Portfolio pulse**: one row per product showing health, tasks, clicks, sessions, key events and posts.
  - **Next best actions**.
  - The state of each Analytics property.
- **Product → Growth tab**: KPIs, a trend chart (one metric at a time, with a table view), channels and landing pages with change, and product-specific next actions.
- "Not connected" is always shown as **Connect / —**, never as 0.

### 1.6 Command center upgrades (`CORE`, Shipped)

- **Next best actions** at the top. Deterministic rules, ranked by severity, cover:
  - pending approvals;
  - failing integrations;
  - overdue tasks that are yours or have no owner;
  - posts waiting for review;
  - renewals within 7 days;
  - traffic drops of 25% or more (with minimum volume);
  - search-click drops;
  - piles of open SEO opportunities;
  - content cadence gaps (no post in 21+ days on a live product);
  - at-risk or critical products.

  Every item states its evidence and links to the exact place to act.
- **Portfolio pulse**: all your products on one screen.
- Setup checklist: "Connect Analytics or Search Console" and "Publish a first blog post".
- The activity feed describes content, integration, agent, automation and approval events in plain words and links to posts.

### 1.7 Automations (`V1`, Shipped)

- **Traffic drop alert**: GA4 sessions over the last 7 days vs the previous 7, with a threshold % and a minimum-volume guard. It notifies once per data week.
- **Content review reminder**: posts waiting in review for N days. It notifies publishers once per week per post.
- The scheduler order is now: provider sync → uptime → **scheduled posts** → automations → agents.

### 1.8 Mobile (`CORE`, Shipped)

- **Bottom tab bar** on phones: Home, Work, Inbox (with unread badge), Growth, and More, which opens the full drawer. It respects the iPhone safe area.
- The sidebar is grouped into the core items, **Grow** (Growth, Content, SEO) and **Operate** (Agents, Automations, Finance, Integrations, Activity, Settings), with an inbox count.
- **Installable PWA** (`manifest.webmanifest`, `viewport-fit=cover`, Apple web-app meta): add it to your home screen and it opens like an app.
- New pages are mobile-first: post lists and the pulse table become stacked cards, filter strips scroll horizontally, and no page scrolls sideways at 390 px (checked on every new page).
- Command palette: New blog post, Growth, Content studio, Posts waiting for review, Inbox, SEO, Agents, Automations, Integrations.

### 1.9 Permissions

| Capability | Owner | Admin | Manager | Member | Viewer | Guest | Billing |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `content.view` | ✓ | ✓ | ✓ | ✓ | ✓ | – | – |
| `content.edit` (write, request review) | ✓ | ✓ | ✓ | ✓ | – | – | – |
| `content.publish` (approve, schedule, publish, settings) | ✓ | ✓ | ✓ | – | – | – | – |
| `analytics.view` | ✓ | ✓ | ✓ | ✓ | ✓ | – | – |
| Turn on **auto** publishing | ✓ | ✓ | – | – | – | – | – |

### 1.10 Vercel connector (`V1`, Shipped 2026-11-21)

Built because every product site is a Next.js app deployed on Vercel. Setup steps are in [README → Vercel deployments](README.md#vercel-deployments).

- **Connect with an access token** that the owner creates in Vercel and pastes in Integrations. Flotilla checks it against `GET /v2/user` before storing it, encrypted. No server env var or Vercel marketplace app is needed. Flotilla only sends read requests: projects (`/v10/projects`), deployments (`/v7/deployments`) and domains (`/v9/projects/{id}/domains`), for the personal account and every team the token can see.
- **Explicit mapping**: each Vercel project is linked to one product, like Search Console and GA4 properties. Linking syncs straight away and adds the product's **Domain** (the verified, non-redirect production domain) and **Repository** links when the product has none. Existing links are never changed.
- **Product → Overview → Deployments**: production state (Ready, Failed, Building, Queued, Canceled, Blocked), the production domain, the commit, branch and author, and build logs on failure. When the newest build failed, the panel names the deployment that is still serving. It also lists the 8 most recent deployments, previews included. The latest 50 deployments per project are stored.
- **Freshness without a paid plan**: opening a product refreshes data older than 2 minutes in the background. Sync now and every scheduler run (Vercel is synced on each run) refresh it too.
- **Instant updates (optional)**: a Vercel team webhook (Pro or Enterprise) pointed at `/api/integrations/vercel/webhook?connection=<id>`. Each delivery is verified with `x-vercel-signature` (HMAC-SHA1 of the raw body, compared in constant time). A verified deployment event re-syncs that project from the API, so a replayed body can't write anything Vercel doesn't confirm.
- **Failed production deploys** create an attention signal on the product and portfolio. The new **Production deploy failed → alert** automation notifies the product owner once per failed deployment, with the build-log link. It runs right after each Vercel sync.
- **Token lifecycle**: an expired or deleted token puts the connection in **Reconnect needed**. Pasting a new token for the same account restores it and keeps the project links. Disconnecting deletes the token from Flotilla (delete it in Vercel too) and can delete all synced deployments.
- Migration `0003_vercel`: a `deployment` table, plus `webhook_secret_enc` and `webhook_last_at` on `integration_connection`.

**Fixed with this change**

- A transient sync failure (Google or Vercel unavailable) left the connection in "Sync failed" even after the next sync succeeded, and the scheduler stopped retrying it. Successful syncs now clear the error, and the scheduler retries connections in that state.
- Mapping a property or project now records product names, not ids, in the activity log.
- The JSON export now also includes integration resources, deployments, GA4 daily data and content posts. Tokens and secrets are still never exported.

### 1.11 Setup checklist (to use what shipped)

1. Set `BETTER_AUTH_URL` to your real https domain. It is also the hosted-blog origin.
2. In Google Cloud, enable the Search Console API, Analytics Data API and Analytics Admin API. Add both redirect URIs from `.env.example`.
3. Integrations → connect Google Analytics 4 and map each property to a product.
4. Product → Content → Publishing: choose Hosted blog (switch it on) or Webhook, then pick a policy.
5. Submit `/blog/<ws>/<product>/sitemap.xml` in Search Console for each product with a hosted blog.
6. Agents → install a **Content Writer** scoped to one product (weekly), enable `request_publish` if you want it, and set a budget. Install a **Growth Analyst** (weekly).
7. Automations → add **Traffic drop alert** and **Content review reminder**.
8. Scheduler: Vercel Hobby runs `/api/cron` daily. For on-time scheduled posts, run it hourly (Vercel Pro or any external cron with `CRON_SECRET`).

---

## 2. Proposed next: growth and SEO

| # | Feature | Tag | What it does | Honest constraints |
|---|---|---|---|---|
| G1 | **Opportunity → post** button | V1 | From an SEO insight, prefill a post with the query as keyword and the page as context; or hand it to the Content Writer. | Needs `sourceInsightId` wiring (the column exists). |
| G2 | **Keyword map per product** | V1 | Keyword → target page/post, intent, current position (GSC). Flags cannibalisation (two pages, one query). | Only queries Search Console reports; no third-party volume data unless a provider is added. |
| G3 | **Content refresh queue** | V1 | Posts older than 6 months whose clicks fell more than 30% are proposed for a refresh, with the queries they lost. | Needs page-level GSC history per post URL. |
| G4 | **Internal-link suggestions** | V1 | Suggests links between your posts that share keywords; shown in the editor. | Deterministic text matching first; embeddings only if needed. |
| G5 | **Post performance** | V1 | For each published post: clicks, impressions and position (GSC page dimension) plus sessions and key events (GA4 landing page). | Join on canonical URL; must handle trailing slashes and query strings. |
| G6 | **Bing Webmaster Tools** connector | V2 | Bing clicks/impressions and sitemap submission via its official API. | API key per site. |
| G7 | **Technical audit at scale** | V2 | Raise the crawl cap, schedule weekly crawls, diff against last run, Core Web Vitals via the PageSpeed Insights API. | Respect robots and rate limits; crawler facts are not indexing facts. |
| G8 | **URL Inspection** | V2 | Per-URL index status from the Search Console URL Inspection API, within quota. | Never promise indexing; the Google Indexing API is **not** used (it is restricted to job postings and livestreams). |
| G9 | **Competitor watch** | LATER | Track a competitor's sitemap and RSS for new pages; propose counter-content. | Only public feeds; respect robots and terms. |
| G10 | **Growth experiments** | V2 | Hypothesis → variant → metric → result, linked to GA4. | No "significance" claims without a valid method and sample size. |

## 3. Proposed next: content and distribution

| # | Feature | Tag | What it does | Honest constraints |
|---|---|---|---|---|
| C1 | **Social distribution drafts** | V1 | For each published post, an agent drafts platform-specific posts (X, LinkedIn, Reddit, dev.to, Hashnode) into a queue. | Drafts only by default. Publishing uses each platform's official API with approval or explicit policy; some platforms forbid automation. |
| C2 | **Cross-posting with canonical** | V2 | Publish to dev.to/Hashnode/Medium with a canonical link back to the original. | Official APIs only. |
| C3 | **GitHub-commit destination** | V1 | Publish as a Markdown/MDX file via a pull request to the product's repo (for static sites). | Needs the GitHub connector; PR, not direct push, by default. |
| C4 | **Newsletter digest** | V2 | Monthly "what we shipped and wrote" email per product via Resend/Buttondown. | Consent and unsubscribe required. |
| C5 | **Changelog & release notes pages** | V1 | Public changelog per product from releases and roadmap "done" items, with RSS. | Opt-in per product. |
| C6 | **Image handling** | V1 | Upload cover/inline images to S3-compatible storage; generated OG images per post. | File validation and size limits. |
| C7 | **Rich editor** | V2 | Optional WYSIWYG on top of Markdown; slash commands; tables. | Markdown stays the source of truth. |
| C8 | **Content briefs** | V1 | The agent produces a brief (outline, questions to answer, internal links) for human writers. | |
| C9 | **Multi-language posts** | LATER | Translations linked by `hreflang`. | Human review before publishing. |
| C10 | **Custom domain for hosted blogs** | V2 | `blog.yourproduct.com` → hosted blog with automatic TLS. | Needs the hosting provider's domain API. |

## 4. Proposed next: analytics and revenue

| # | Feature | Tag | What it does |
|---|---|---|---|
| A1 | **Stripe connector** | CORE (next) | MRR, new/expansion/churned MRR, customers, refunds; replaces manual revenue; feeds the pulse and next actions (e.g. churn spike). |
| A2 | **PostHog connector** | V1 | Signups, activation, retention cohorts and funnels per product. |
| A3 | **Unified funnel per product** | V1 | Impressions → clicks (GSC) → sessions (GA4) → signups (PostHog) → paid (Stripe), each step labelled with its source and coverage. |
| A4 | **Metric catalog** | V1 | Definition, formula, source, owner and freshness for every metric (master prompt §11). |
| A5 | **Goals tied to metrics** | V1 | Goals read their "current value" from a synced metric instead of manual check-ins. |
| A6 | **Anomaly detection** | V2 | Seasonality-aware alerts (weekday baseline) instead of fixed thresholds. |
| A7 | **Unit economics per product** | V2 | Revenue minus allocated costs (finance) = contribution margin, with incomplete-data warnings. |

## 5. Proposed next: agents and automation

| # | Feature | Tag | What it does |
|---|---|---|---|
| AG1 | **Live run streaming** | V1 | Server-sent events instead of auto-refresh on the run page. |
| AG2 | **Agent evaluations** | V1 | Fixed test inputs per agent version; rejection/edit rate of drafts tracked as the quality metric (master prompt §16.8). |
| AG3 | **Social Distribution Agent** | V1 | Builds C1 drafts from new posts. |
| AG4 | **Launch Agent** | V2 | Turns a release into a launch kit: changelog entry, blog post draft, social drafts, Product Hunt checklist; everything as drafts. |
| AG5 | **Support/Feedback Triage Agent** | V2 | Clusters feedback, links it to roadmap items, proposes tasks. |
| AG6 | **Agent memory (scoped)** | V2 | Editable notes per agent and product (brand voice, banned claims, preferred topics). |
| AG7 | **Brand voice profile per product** | V1 | Tone, audience, words to avoid; injected into content agents. |
| AU1 | **Visual workflow builder** | V2 | Branches and multi-step flows on the existing engine. |
| AU2 | **Event triggers** | V1 | Run automations on events (post published, deploy failed, payment failed), not just on the schedule. |
| AU3 | **Slack/Telegram/Discord delivery** | V1 | Inbox items and digests to chat via official bot APIs. |

## 6. Proposed next: dashboard, mobile and UX

| # | Feature | Tag | What it does |
|---|---|---|---|
| U1 | **Web push notifications** | V1 | Critical inbox items (site down, approvals, traffic drop) on your phone via the PWA. |
| U2 | **Swipe actions in the inbox** | V1 | Swipe to resolve, or to approve/reject (approve still requires an explicit tap). |
| U3 | **Today view** | V1 | One scrollable mobile screen: next actions, approvals, my tasks due today, posts going out today. |
| U4 | **Saved dashboard layouts** | V2 | Choose and reorder command-center panels per user. |
| U5 | **Weekly review mode** | V1 | Guided flow from master prompt §26.7: step through each product, record a decision, set the next review date. |
| U6 | **Offline read cache** | LATER | Last-synced command center readable offline. |
| U7 | **Keyboard shortcuts sheet** | V1 | `g g` growth, `g c` content, `c p` new post, and so on. |

## 7. Proposed next: engineering and operations

| # | Feature | Tag | What it does |
|---|---|---|---|
| E1 | **GitHub connector** | CORE (next) | Repos ↔ products, PRs, releases; release → changelog/blog draft. |
| E2 | ~~Vercel connector~~ | V1 | **Shipped 2026-11-21**: see §1.10. |
| E3 | **Status page per product** | V2 | Public uptime history from the existing checks. |
| E4 | **Background job platform** | V1 | Move sync, agents and publishing from cron + `after()` to Inngest/Trigger.dev when runs exceed serverless limits (BUILD.md decision 10). |
| E5 | **Row-level security** | CORE (before outside users) | Second tenant-isolation layer (BUILD.md §3.1). |

## 8. Proposed next: for other founders (multi-tenant SaaS)

| # | Feature | Tag | What it does |
|---|---|---|---|
| S1 | **Templates gallery** | V1 | One-click setup: "SaaS launch", "content site", "client project" (products, automations, agents, checklists). |
| S2 | **Plans & entitlements** | V2 | Limits on products, agent spend and automation runs, enforced server-side (master prompt §21). Prices only after validation. |
| S3 | **Client portal** | V2 | Read-only report links for agency clients, expiring and revocable. |
| S4 | **Public portfolio page** | LATER | Opt-in "what I'm building" page across products. |
| S5 | **Data import** | V1 | CSV/Notion import for products, tasks, posts. |

---

## 9. Non-negotiables carried forward

- Not connected ≠ zero. Every metric shows its source, period and freshness.
- Agents never publish, message, spend or delete outside a policy the owner explicitly set, and every action is logged and reversible where possible (unpublish, archive).
- No promises of rankings, indexing or traffic. IndexNow ≠ Google. No use of Google's Indexing API for blog posts.
- Social and other publishing only through official APIs and within each platform's terms.

## 10. Changelog

| Date | Change |
|---|---|
| 2026-11-21 | Workspace created automatically on first sign-in (no setup step); **Add project** and **Invite member** in a top bar on every page; new **Team** page (members, roles, invitations); "products" are called "projects" throughout the interface; black-and-white design with one sans-serif typeface; new long landing page. Tests: 86. |
| 2026-11-21 | Vercel connector (deployments per product, failed-deploy signal and alert, optional webhook), sync-recovery fix, export completeness. Migration `0003_vercel`. Tests: 15 new (84 total). |
| 2026-11-19 | Content Studio, hosted blog plus feeds, signed webhook publishing, IndexNow, Content Writer and Growth Analyst agents, GA4 connector, Growth dashboard, next best actions, portfolio pulse, two new automations, mobile tab bar and PWA. Migration `0002_growth`. Tests: 24 new (56 total). |

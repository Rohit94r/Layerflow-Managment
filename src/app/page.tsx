import Link from "next/link";
import {
  Activity, ArrowRight, BarChart3, Bell, BookOpen, Bot, Check, CircleDollarSign, Download, FileText, Gauge, Globe, Home, Inbox,
  KeyRound, LayoutGrid, ListChecks, Lock, Map as MapIcon, PenSquare, Plus, Rocket, Search, Settings, ShieldCheck, Smartphone,
  TrendingUp, UserPlus, Users, Workflow,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { getSession } from "@/server/context";
import { APP_NAME } from "@/lib/brand";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/modules/identity/constants";
import { templates } from "@/modules/automation/service";
import { AGENT_CATALOG } from "@/ai/catalog";

type Icon = React.ComponentType<{ className?: string }>;

const PROBLEMS: { title: string; body: string }[] = [
  { title: "Information lives in ten places", body: "Tasks in one app, notes in another, costs in a spreadsheet, traffic in Google, deployments in Vercel. Answering “how is this project doing?” means opening all of them." },
  { title: "Things slip quietly", body: "A domain renews before you cancel it. A production build fails on a Friday. A bug sits overdue for two weeks. Nothing tells you until it costs you." },
  { title: "Your team works half-blind", body: "People don't know which project matters most this week, who owns what, or what was decided last month, so they ask you, again." },
];

const PROJECT_TABS: { icon: Icon; name: string; body: string }[] = [
  { icon: LayoutGrid, name: "Overview", body: "Stage, health, priority, focus and owner. Links to the site, repository and docs. Live Vercel deployments, what needs attention, the next tasks and recent activity." },
  { icon: ListChecks, name: "Work", body: "Tasks and bugs with board and list views, assignees, due dates, priorities and comments. Each task has a number, like #42." },
  { icon: MapIcon, name: "Roadmap", body: "What you're doing now, next and later, tied to measurable goals with a target and a deadline." },
  { icon: BookOpen, name: "Docs", body: "Specs, runbooks, meeting notes and a decision log with revisit dates, written in Markdown and kept with the project." },
  { icon: BarChart3, name: "Growth", body: "Google Analytics 4 sessions, users, key events, channels and landing pages, compared with the previous period." },
  { icon: PenSquare, name: "Content", body: "Blog posts with a live SEO score, review, scheduling and publishing to a hosted blog or straight to your own site." },
  { icon: TrendingUp, name: "SEO & uptime", body: "Search Console clicks, queries and pages, evidence-backed opportunities, a site audit, and uptime and SSL checks." },
  { icon: Bot, name: "Agents", body: "AI agents scoped to this one project, with an owner, a budget and only the tools you allow." },
  { icon: CircleDollarSign, name: "Finance", body: "Subscriptions, domains and hosting costs with renewal dates, recorded revenue, and a monthly budget." },
  { icon: Activity, name: "Activity", body: "Every change to the project: what changed, who changed it and when." },
  { icon: Settings, name: "Settings", body: "Name, summary, audience, business model, tech stack, tags, launch date, parent project, archive and delete." },
];

const WORKSPACE: { icon: Icon; name: string; body: string }[] = [
  { icon: Home, name: "Command center", body: "Your day in one screen: projects that need attention and why, overdue work, upcoming renewals, open opportunities and a setup checklist." },
  { icon: LayoutGrid, name: "All projects", body: "Every project in a table or grid. Filter by stage, health, priority, focus or group, pin favourites, and archive what's paused." },
  { icon: ListChecks, name: "Work across projects", body: "Every task and bug in one place: “my open tasks”, overdue, by project or by person." },
  { icon: Inbox, name: "Inbox", body: "Alerts and approvals addressed to you, with unread counts. Mark read, resolve, or jump to the source." },
  { icon: Users, name: "Team", body: "Members, roles and invitations on one page. Invite by link; roles decide what each person can see and change." },
  { icon: Search, name: "Search everything", body: "Press Ctrl K to jump to any project, task (#12), doc or page, or to run a command like Add project." },
  { icon: CircleDollarSign, name: "Finance", body: "Monthly run-rate per project, renewals coming up, revenue, and budgets that warn before you overspend. Currencies are never silently mixed." },
  { icon: BarChart3, name: "Growth", body: "Traffic, search, conversions and content for every project side by side, with the next best actions." },
  { icon: PenSquare, name: "Content studio", body: "Plan, write, review and publish posts for every project from one calendar." },
  { icon: Workflow, name: "Automations", body: "Ready-made rules for reminders and alerts. Dry-run first; every run is recorded and acts only once per event." },
  { icon: Activity, name: "Activity log", body: "A complete history of the workspace, newest first: who changed what, and when." },
  { icon: Download, name: "Export", body: "Download everything as JSON at any time. Your data is never locked in." },
];

const STEPS: { icon: Icon; title: string; body: string }[] = [
  { icon: KeyRound, title: "Sign in", body: "No setup screens. Your workspace is created for you the first time you sign in." },
  { icon: Plus, title: "Add your projects", body: "Use Add project at the top of any page. Only the name is required; add stage, owner, links and the rest whenever you like. Add as many as you run." },
  { icon: UserPlus, title: "Invite your team", body: "Open Team, enter an email and a role, and send the one-time link. They join with that email and see only what their role allows." },
  { icon: Globe, title: "Connect your tools (optional)", body: "Link Vercel projects, Search Console and Analytics 4 to projects. Data then appears on each project with its source and freshness." },
  { icon: Gauge, title: "Run your day from one screen", body: "Start at the Command center, clear your Inbox, and open any project to see everything about it in one place." },
];

const INTEGRATIONS: { name: string; body: string; points: string[] }[] = [
  { name: "Vercel", body: "For every site you deploy on Vercel.", points: ["Live, building or failed: per project", "Branch, commit, author and build logs", "Failed production deploys flagged and alerted", "Domain and repository links filled in for you", "Instant updates with an optional webhook"] },
  { name: "Google Search Console", body: "How each site performs in Google Search.", points: ["Clicks, impressions, CTR and position", "Top queries and pages, this period vs last", "Opportunities backed by the numbers", "Read-only access"] },
  { name: "Google Analytics 4", body: "How people use each site.", points: ["Sessions, users, page views, key events", "Channels, landing pages and devices", "Traffic-drop alerts", "Read-only access"] },
  { name: "Your own Next.js site", body: "Publish blog posts where your readers are.", points: ["Signed webhook delivers each post", "Or a hosted blog with RSS, sitemap and JSON feed", "IndexNow ping to Bing and others", "Live URL recorded only after your site confirms"] },
];

const SAFETY: { icon: Icon; title: string; body: string }[] = [
  { icon: Lock, title: "Private by invitation", body: "There's no public sign-up. Only people you invite, with the email you invited, can join." },
  { icon: ShieldCheck, title: "Permissions on the server", body: "Every request checks the person's role. Hiding a button is never the only protection." },
  { icon: KeyRound, title: "Encrypted connections", body: "Google and Vercel tokens and webhook secrets are encrypted at rest and never sent to the browser." },
  { icon: Activity, title: "Nothing happens silently", body: "Every change, automation run and agent step is logged with who or what did it." },
  { icon: Bot, title: "Agents ask first", body: "Agents can read and draft. Anything consequential waits for a person's approval, and a kill switch stops them all." },
  { icon: Download, title: "Your data, exportable", body: "One click exports the whole workspace as JSON." },
];

const FAQ: { q: string; a: string }[] = [
  { q: `What is ${APP_NAME}?`, a: `A management tool for founders and small teams who run several projects at once (apps, websites, client work, ideas). Each project gets one page with everything about it, and the whole team works from the same place.` },
  { q: "Do I have to create an organisation first?", a: "No. Sign in and you're in. Your workspace is created automatically and you can rename it in Settings. Use Add project at the top of any page to start." },
  { q: "How many projects can I add?", a: "As many as you run. They all appear in Projects, and you can group, pin, filter and archive them." },
  { q: "How do I add my team?", a: "Open Team (or use Invite member at the top), enter their email and pick a role. Send them the link; it works once, for that email, for seven days." },
  { q: "What can each team member see?", a: "It depends on their role. For example, viewers can't see finance, guests see only projects and work, and billing managers see only finance. You can change a role at any time." },
  { q: "Do I need to connect anything?", a: "No. Projects, tasks, docs, roadmap, finance and team all work on their own. Connecting Vercel, Search Console or Analytics adds live data to each project." },
  { q: "Can I use it on my phone?", a: "Yes. Every page works at phone width, there's a bottom tab bar, and you can add it to your home screen to open it like an app." },
  { q: "Where is my data?", a: "In your own deployment's Postgres database. Nothing is shared with other customers, and you can export everything at any time." },
];

export default async function Landing() {
  const session = await getSession();
  const primary = session ? { href: "/onboarding", label: "Open the app" } : { href: "/sign-in", label: "Sign in" };
  const automationList = templates();

  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between px-4 sm:px-8">
          <Link href="/" aria-label={`${APP_NAME} home`}><Logo /></Link>
          <nav className="flex items-center gap-1 text-[14px]" aria-label="Sections">
            <a href="#project" className="btn btn-ghost hidden md:inline-flex">Features</a>
            <a href="#how" className="btn btn-ghost hidden md:inline-flex">How it works</a>
            <a href="#team" className="btn btn-ghost hidden md:inline-flex">Team</a>
            <a href="#integrations" className="btn btn-ghost hidden md:inline-flex">Integrations</a>
            <a href="#faq" className="btn btn-ghost hidden md:inline-flex">FAQ</a>
            <Link href={primary.href} className="btn btn-primary ml-1">{primary.label} <ArrowRight className="size-3.5" /></Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[1160px] px-4 pb-14 pt-14 sm:px-8 sm:pt-24">
          <div className="eyebrow mb-5">Project management for founders and small teams</div>
          <h1 className="max-w-4xl text-[2.5rem] leading-[1.05] tracking-[-0.035em] sm:text-[4.25rem]">
            Every project you run.
            <br />
            Your whole team.
            <br />
            <span className="text-muted">One place.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">
            {APP_NAME} keeps each project&apos;s status, tasks, docs, costs, traffic, search rankings and deployments together with the
            people working on it, and tells you what needs attention next. You stop switching between ten tools.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href={primary.href} className="btn btn-primary h-11 px-5 text-[15px]">{primary.label} <ArrowRight className="size-4" /></Link>
            <a href="#how" className="btn btn-secondary h-11 px-5 text-[15px]">See how it works</a>
          </div>
          <p className="mt-4 text-[13px] text-muted">Private workspace. Team members join by invitation.</p>
        </section>

        {/* Product preview: a schematic of the command center */}
        <section className="mx-auto max-w-[1160px] px-4 sm:px-8" aria-label="What the app looks like">
          <div className="overflow-hidden rounded-xl border border-ink/80 shadow-float">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken px-4 py-2.5">
              <div className="flex gap-1.5"><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /></div>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[12px]"><UserPlus className="size-3.5" /> Invite member</span>
                <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[12px] text-bg"><Plus className="size-3.5" /> Add project</span>
              </div>
            </div>
            <div className="grid gap-0 bg-surface md:grid-cols-[1fr_1.3fr]">
              <div className="border-b border-line p-5 md:border-b-0 md:border-r">
                <div className="eyebrow mb-3">Needs attention</div>
                <ul className="space-y-3 text-[13.5px]">
                  {[
                    ["Main app", "Latest production deploy failed on Vercel"],
                    ["Hackathon finder", "2 overdue tasks · 1 high-priority bug"],
                    ["Client website", "Domain renews in 9 days"],
                    ["Blog", "Sessions down 31% week over week"],
                  ].map(([p, s]) => (
                    <li key={p} className="flex gap-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink" />
                      <span><span className="font-medium">{p}</span><span className="block text-muted">{s}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0 p-5">
                <div className="eyebrow mb-3">Projects</div>
                <div className="overflow-x-auto">
                  <table className="table min-w-[420px] text-[13px]">
                    <thead><tr><th>Project</th><th>Stage</th><th>Health</th><th>Open work</th></tr></thead>
                    <tbody>
                      {[
                        ["Main app", "Live", "At risk", "12"],
                        ["Hackathon finder", "Beta", "Watch", "5"],
                        ["Client website", "Live", "Healthy", "2"],
                        ["Blog", "Growth", "Healthy", "3"],
                        ["New idea", "Idea", "Unknown", "0"],
                      ].map(([n, s, h, w]) => (
                        <tr key={n}>
                          <td className="font-medium">{n}</td>
                          <td><span className="rounded border border-line-strong px-1.5 py-0.5 text-[11.5px]">{s}</span></td>
                          <td className="text-ink-2">{h}</td>
                          <td className="tabular-nums">{w}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] text-muted">A simplified view of the Command center.</p>
        </section>

        {/* Problem */}
        <Section id="why" eyebrow="Why" title="Running several projects shouldn't mean running ten tools.">
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <div key={p.title} className="bg-surface p-6">
                <div className="mb-4 font-mono text-[12px] text-muted">0{i + 1}</div>
                <h3 className="text-[1.15rem]">{p.title}</h3>
                <p className="mt-2 text-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-[17px] leading-relaxed">
            {APP_NAME} puts all of it in one workspace. Every project has one page with everything about it, every alert reaches the
            right person, and every number shows where it came from and how fresh it is.
          </p>
        </Section>

        {/* One page per project */}
        <Section
          id="project"
          eyebrow="Everything about a project"
          title="One page per project. Nothing to look up anywhere else."
          intro="Open any project and its tabs hold its whole story: plans, work, knowledge, numbers and history."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROJECT_TABS.map((t) => (
              <Card key={t.name} icon={t.icon} title={t.name}>{t.body}</Card>
            ))}
          </div>
        </Section>

        {/* Workspace */}
        <Section
          id="workspace"
          eyebrow="Across all projects"
          title="See the whole picture, then act on it."
          intro="Above the projects sits the workspace: one view of everything you run and everyone who runs it."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WORKSPACE.map((t) => (
              <Card key={t.name} icon={t.icon} title={t.name}>{t.body}</Card>
            ))}
          </div>
        </Section>

        {/* How it works */}
        <Section id="how" eyebrow="How it works" title="From sign-in to a running team in five steps.">
          <ol className="grid gap-4 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-full bg-ink text-[13px] font-semibold text-bg">{i + 1}</span>
                  <s.icon className="size-5 text-muted" />
                </div>
                <h3 className="text-[1.05rem]">{s.title}</h3>
                <p className="mt-2 text-[13.5px] text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Team */}
        <Section
          id="team"
          eyebrow="Your team"
          title="Bring everyone in, and give each person exactly the access they need."
          intro="Invite co-founders, developers, freelancers, clients and your accountant into the same workspace. A role decides what each of them can see and change, and the server enforces it on every request."
        >
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              {[
                ["Invite by link", "Enter an email and a role. The link works once, only for that email, and expires in seven days."],
                ["Assign owners", "Every project and task can have an owner, so alerts and reminders reach the right person."],
                ["Discuss in place", "Comment on tasks, and keep decisions in docs where everyone can find them later."],
                ["Change access any time", "Change a role or remove someone in one click. The change applies immediately."],
              ].map(([t, b]) => (
                <div key={t} className="flex gap-3">
                  <Check className="mt-1 size-4 shrink-0" />
                  <div><div className="font-medium">{t}</div><p className="text-ink-2">{b}</p></div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="table min-w-[420px]">
                <thead><tr><th>Role</th><th>What they can do</th></tr></thead>
                <tbody>
                  {ROLES.map((r) => (
                    <tr key={r}><td className="font-medium">{ROLE_LABELS[r]}</td><td className="text-ink-2">{ROLE_DESCRIPTIONS[r]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* Integrations */}
        <Section
          id="integrations"
          eyebrow="Connected"
          title="Live data from the tools your sites already use."
          intro="Connections are optional and read-only where the provider allows it. Each one is linked to a specific project, shows when it last synced, and can be disconnected with its data deleted."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {INTEGRATIONS.map((i) => (
              <div key={i.name} className="rounded-xl border border-line p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[1.15rem]">{i.name}</h3>
                  <span className="rounded border border-ink px-1.5 py-0.5 text-[11px] font-medium">Available</span>
                </div>
                <p className="mt-1 text-ink-2">{i.body}</p>
                <ul className="mt-4 space-y-1.5 text-[13.5px]">
                  {i.points.map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0" />{p}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-muted">Planned, not available yet: GitHub, Stripe and PostHog.</p>
        </Section>

        {/* Automations and agents */}
        <Section
          id="automations"
          eyebrow="Automations & AI agents"
          title="Let the routine work run itself, with you in control."
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 text-[1.15rem]"><Bell className="size-4" /> Automations</h3>
              <p className="mt-1 text-ink-2">Switch on a ready-made rule, try it with a dry run, and it acts once per event. Every run is recorded.</p>
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {automationList.map((t) => (
                  <li key={t.key} className="px-4 py-3">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[13px] text-muted">{t.trigger}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-[1.15rem]"><Bot className="size-4" /> AI agents</h3>
              <p className="mt-1 text-ink-2">
                Each agent has an owner, a scope, a budget and only the tools you allow. Anything consequential waits for approval, and
                every step is visible. Requires an Anthropic API key.
              </p>
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {AGENT_CATALOG.map((a) => (
                  <li key={a.key} className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[13px] text-muted">{a.summary}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* Safety */}
        <Section id="security" eyebrow="Trust" title="Built to be trusted with your business.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAFETY.map((s) => <Card key={s.title} icon={s.icon} title={s.title}>{s.body}</Card>)}
          </div>
        </Section>

        {/* Mobile */}
        <Section id="mobile" eyebrow="Anywhere" title="On your desk and in your pocket.">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <ul className="space-y-3 text-[15px]">
              {[
                "Every page works at phone width, with nothing scrolling sideways.",
                "A bottom tab bar for Home, Projects, Work, Inbox and the full menu.",
                "Add it to your home screen and it opens like an app, without the browser bar.",
                "Light and dark mode, following your device or your choice.",
              ].map((t) => <li key={t} className="flex gap-3"><Smartphone className="mt-0.5 size-4 shrink-0" />{t}</li>)}
            </ul>
            <div className="mx-auto w-[220px] rounded-[2rem] border-[6px] border-ink bg-surface p-3" aria-hidden>
              <div className="mb-3 flex items-center justify-between"><Logo withName={false} /><Plus className="size-4" /></div>
              <div className="space-y-2">
                {["Main app", "Hackathon finder", "Client website", "Blog"].map((n, i) => (
                  <div key={n} className="rounded-lg border border-line p-2.5">
                    <div className="text-[12px] font-medium">{n}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full bg-ink" style={{ width: `${[72, 45, 88, 60][i]}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-5 border-t border-line pt-2 text-muted">
                {[Home, LayoutGrid, ListChecks, Inbox, FileText].map((I, i) => <I key={i} className="mx-auto size-4" />)}
              </div>
            </div>
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" eyebrow="Questions" title="Frequently asked questions.">
          <div className="divide-y divide-line rounded-xl border border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Plus className="size-4 shrink-0 transition-transform group-open:rotate-45" />
                </summary>
                <p className="mt-2 max-w-3xl text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Final call to action */}
        <section className="bg-ink text-bg">
          <div className="mx-auto flex max-w-[1160px] flex-col items-start gap-6 px-4 py-20 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[2rem] leading-tight text-bg sm:text-[2.6rem]">Bring every project under one roof.</h2>
              <p className="mt-2 max-w-xl text-bg/70">Sign in, add your projects, invite your team. That&apos;s the whole setup.</p>
            </div>
            <Link href={primary.href} className="btn h-11 shrink-0 bg-bg px-5 text-[15px] text-ink hover:bg-bg/90">
              <Rocket className="size-4" /> {primary.label}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <span>Projects, team and data in one place.</span>
          <Link href={primary.href} className="link">{primary.label}</Link>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1160px] px-4 py-16 sm:px-8 sm:py-24">
        <div className="eyebrow mb-3">{eyebrow}</div>
        <h2 className="max-w-3xl text-[1.9rem] leading-[1.12] sm:text-[2.6rem]">{title}</h2>
        {intro && <p className="mt-4 max-w-3xl text-[16px] leading-relaxed text-ink-2">{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Card({ icon: I, title, children }: { icon: Icon; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-5 transition-colors hover:border-ink">
      <I className="size-5" />
      <h3 className="mt-4 text-[1.05rem]">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

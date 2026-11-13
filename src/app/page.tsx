import Link from "next/link";
import { ArrowRight, BookOpen, CircleDollarSign, LayoutGrid, ListChecks, ShieldCheck, Activity } from "lucide-react";
import { Logo } from "@/components/ui";
import { CoastIllustration } from "@/components/illustration";
import { getSession } from "@/server/context";
import { APP_NAME } from "@/lib/brand";

const REPO = "https://github.com/Rohit94r/Layerflow-Managment";

const FEATURES = [
  { icon: LayoutGrid, title: "One portfolio", body: "Every product with its stage, priority, focus and health — five independent dimensions, never one muddled status." },
  { icon: ListChecks, title: "Work that moves", body: "Tasks and bugs per product with a board, a list, owners and due dates. Overdue work surfaces on its own." },
  { icon: BookOpen, title: "Decisions on record", body: "PRDs, runbooks, meeting notes and a decision log with revisit dates, attached to the product they shape." },
  { icon: CircleDollarSign, title: "Honest money", body: "Costs, renewals and revenue per product. Currencies are never silently mixed; estimates are labelled." },
  { icon: Activity, title: "Full history", body: "Every change is recorded with who made it and what changed, so nothing in the portfolio is a mystery." },
  { icon: ShieldCheck, title: "Built for teams", body: "Workspaces per company or client, seven roles with server-side permissions, and a full JSON export." },
];

export default async function Landing() {
  const session = await getSession();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-6 sm:px-10">
        <Logo />
        <nav className="flex items-center gap-1.5 text-[14px]">
          <a href="#features" className="btn btn-ghost hidden sm:inline-flex">Features</a>
          <a href="#how" className="btn btn-ghost hidden sm:inline-flex">How it works</a>
          {session ? (
            <Link href="/onboarding" className="btn btn-primary">Open app <ArrowRight className="size-3.5" /></Link>
          ) : (
            <>
              <Link href="/sign-in" className="btn btn-ghost">Sign in</Link>
              <Link href="/sign-up" className="btn btn-primary">Get started</Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-[1200px] px-5 pb-16 pt-10 sm:px-10 sm:pt-20">
        <div className="eyebrow mb-5">For founders &amp; early developers</div>
        <h1 className="max-w-4xl text-[2.6rem] leading-[1.06] sm:text-[4.2rem]">
          You build many products.
          <br />
          <span className="italic text-cobalt">Run them from one place.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
          {APP_NAME} is the portfolio operating system for people with more ideas than calendars — every product, task,
          decision and cost, connected, with a clear next action.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={session ? "/onboarding" : "/sign-up"} className="btn btn-primary h-11 px-5 text-[15px]">
            {session ? "Open your workspace" : "Start your portfolio"} <ArrowRight className="size-4" />
          </Link>
          <a href={REPO} className="btn btn-secondary h-11 px-5 text-[15px]">View on GitHub</a>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 sm:px-10">
        <div className="panel overflow-hidden shadow-float">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="ml-3 text-[12px] text-muted">Command center</span>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            {[
              ["Active products", "9"],
              ["Need attention", "2"],
              ["Overdue tasks", "4"],
              ["Renewals · 30d", "3"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-bg px-4 py-3">
                <div className="eyebrow">{k}</div>
                <div className="mt-1 font-serif text-3xl">{v}</div>
              </div>
            ))}
            <div className="rounded-lg border border-line bg-bg p-4 sm:col-span-4">
              {[
                ["Main SaaS", "Live", "Healthy", "#1d36c9"],
                ["Hackathon finder", "Public beta", "Watch", "#0b1557"],
                ["Form autofiller", "Building", "Unknown", "#7a4fd1"],
              ].map(([n, l, h, c]) => (
                <div key={n} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                  <span className="size-6 rounded-md" style={{ background: c }} />
                  <span className="flex-1 font-medium">{n}</span>
                  <span className="hidden text-[12.5px] text-ink-2 sm:block">{l}</span>
                  <span className="rounded border border-line px-1.5 text-[11.5px] text-ink-2">{h}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-muted">Illustrative preview with example data.</p>
      </section>

      <section id="features" className="mx-auto max-w-[1200px] px-5 py-24 sm:px-10">
        <h2 className="max-w-2xl text-[2rem] leading-tight sm:text-[2.6rem]">A dashboard is not a workflow. This is both.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-bg p-7">
              <f.icon className="size-5 text-cobalt" />
              <h3 className="mt-4 text-xl">{f.title}</h3>
              <p className="mt-2 text-ink-2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="text-[2rem] leading-tight sm:text-[2.6rem]">From scattered tabs to a weekly ritual.</h2>
          <ol className="space-y-6">
            {[
              ["Register your products", "Add each product once: type, stage, owner, links, stack. Group them, pin the ones in focus."],
              ["Run the work in context", "Tasks, bugs, docs and decisions live inside the product they belong to — and roll up to the portfolio."],
              ["Review what needs you", "The command center ranks products by evidence: overdue work, urgent bugs, renewals, missed reviews."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-5 border-t border-line pt-6">
                <span className="font-serif text-2xl text-cobalt">0{i + 1}</span>
                <div>
                  <h3 className="text-xl">{t}</h3>
                  <p className="mt-1 text-ink-2">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1200px] px-5 pt-14 sm:px-10">
          <div className="flex flex-col justify-between gap-12 lg:flex-row">
            <div className="max-w-sm">
              <Logo />
              <p className="mt-5 text-[16px] leading-relaxed text-ink-2">
                {APP_NAME} is the portfolio and operations platform for founders and early developers.
              </p>
              <div className="mt-7 flex gap-4 text-ink">
                <a href={REPO} aria-label="GitHub" className="hover:text-cobalt">
                  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
                    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
                  </svg>
                </a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-16">
              {[
                ["Product", [["Portfolio", "#features"], ["Work", "#features"], ["Docs & decisions", "#features"], ["Finance", "#features"]]],
                ["Company", [["About", "#how"], ["GitHub", REPO]]],
                ["Resources", [["Build plan", `${REPO}/blob/main/BUILD.md`], ["Vision", `${REPO}/blob/main/product-os-master-prompt-v3.md`]]],
              ].map(([title, links]) => (
                <div key={title as string}>
                  <h4 className="font-serif text-[17px] text-ink">{title as string}</h4>
                  <ul className="mt-5 space-y-3.5">
                    {(links as string[][]).map(([l, href]) => (
                      <li key={l}>
                        <a href={href} className="text-[14.5px] text-muted hover:text-cobalt">{l}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-14 flex flex-col justify-between gap-2 border-t border-line py-5 text-[13.5px] text-ink-2 sm:flex-row">
            <span>Built for people who ship more than one thing.</span>
            <span>{APP_NAME} ©{new Date().getFullYear()}. All rights reserved.</span>
          </div>
        </div>
        <CoastIllustration band className="block aspect-[2/1] w-full" />
      </footer>
    </div>
  );
}

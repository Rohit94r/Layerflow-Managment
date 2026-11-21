import Link from "next/link";
import { Check } from "lucide-react";
import { Logo } from "@/components/ui";

const POINTS = [
  "Every project in one list: stage, health, priority and owner",
  "Tasks, bugs, docs, decisions, roadmap and goals per project",
  "Costs, renewals and revenue, with budgets that warn you",
  "Search Console, Analytics 4 and Vercel deployments, connected",
  "Your team, invited by link, with roles that limit what they see",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-sm py-10">{children}</div>
        </div>
      </div>
      <div className="hidden flex-col justify-center gap-12 bg-ink p-12 text-bg lg:flex">
        <p className="max-w-md text-[1.7rem] font-semibold leading-snug tracking-tight">
          Every project you run, and the team that runs it, in one place.
        </p>
        <ul className="max-w-md space-y-3 text-[14.5px] text-bg/80">
          {POINTS.map((p) => (
            <li key={p} className="flex gap-3">
              <Check className="mt-0.5 size-4 shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

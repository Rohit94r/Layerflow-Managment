import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <Logo className="mb-8" />
        <div className="hatch mx-auto mb-6 size-16 rounded-full border border-line-strong" />
        <h1 className="text-3xl">Not found</h1>
        <p className="mt-2 text-ink-2">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/onboarding" className="btn btn-primary mt-6">Go to your workspaces</Link>
      </div>
    </div>
  );
}

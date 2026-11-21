import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/client/auth-forms";
import { getSession } from "@/server/context";

export const metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  if (await getSession()) redirect("/onboarding");
  const next = (await searchParams).next;
  // Accounts are by invitation only; the invite page links here with ?next=/invite/<token>.
  if (typeof next !== "string" || !next.startsWith("/invite/")) {
    return (
      <>
        <h1 className="text-[2rem] leading-tight">Invitation only</h1>
        <p className="mb-7 mt-1.5 text-ink-2">
          New accounts are created from an invitation link. Ask a workspace owner to invite your email, then open the link they send you.
        </p>
        <Link href="/sign-in" className="btn btn-primary h-10 w-full">Sign in</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-[2rem] leading-tight">Create your account</h1>
      <p className="mb-7 mt-1.5 text-ink-2">Use the email your invitation was sent to.</p>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/client/auth-forms";
import { getSession } from "@/server/context";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSession()) redirect("/onboarding");
  return (
    <>
      <h1 className="text-[2rem] leading-tight">Welcome back</h1>
      <p className="mb-7 mt-1.5 text-ink-2">Sign in to your portfolio.</p>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </>
  );
}

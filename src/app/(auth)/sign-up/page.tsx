import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/client/auth-forms";
import { getSession } from "@/server/context";

export const metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/onboarding");
  return (
    <>
      <h1 className="text-[2rem] leading-tight">Create your account</h1>
      <p className="mb-7 mt-1.5 text-ink-2">One place for every product you run. Free while in early access.</p>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </>
  );
}

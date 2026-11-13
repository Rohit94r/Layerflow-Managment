"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/onboarding";
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const res =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: String(fd.get("name") ?? "").trim() || email.split("@")[0]! })
        : await authClient.signIn.email({ email, password });
    if (res.error) {
      setPending(false);
      setError(
        res.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : res.error.message || (mode === "sign-in" ? "Email or password is incorrect." : "Could not create the account."),
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  const qs = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";
  const prefill = params.get("email") ?? undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "sign-up" && (
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" className="input" autoComplete="name" required maxLength={80} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required defaultValue={prefill} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          minLength={8}
          required
        />
        {mode === "sign-up" && <p className="hint">At least 8 characters.</p>}
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary h-10 w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-[13px] text-ink-2">
        {mode === "sign-up" ? (
          <>Already have an account? <Link className="link" href={`/sign-in${qs}`}>Sign in</Link></>
        ) : (
          <>New here? <Link className="link" href={`/sign-up${qs}`}>Create an account</Link></>
        )}
      </p>
    </form>
  );
}

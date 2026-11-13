import Link from "next/link";
import { getSession } from "@/server/context";
import { peekInvitation } from "@/modules/identity/service";
import { ROLE_LABELS } from "@/modules/identity/constants";
import { AcceptInvite } from "@/components/client/accept-invite";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [session, inv] = await Promise.all([getSession(), peekInvitation(token)]);

  if (!inv || !inv.usable) {
    return (
      <>
        <h1 className="text-[2rem] leading-tight">Invitation unavailable</h1>
        <p className="mt-2 text-ink-2">
          {inv?.status === "accepted" ? "This invitation has already been used." : "This link is invalid, revoked or expired. Ask the person who invited you for a new one."}
        </p>
        <Link href="/onboarding" className="btn btn-secondary mt-6">Go to your workspaces</Link>
      </>
    );
  }

  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <>
      <div className="eyebrow mb-2">Invitation</div>
      <h1 className="text-[2rem] leading-tight">Join {inv.workspaceName}</h1>
      <p className="mt-2 text-ink-2">
        You&apos;ve been invited as <strong className="text-ink">{ROLE_LABELS[inv.role]}</strong> using <strong className="text-ink">{inv.email}</strong>.
      </p>
      <div className="mt-7">
        {session ? (
          session.user.email.toLowerCase() === inv.email.toLowerCase() ? (
            <AcceptInvite token={token} />
          ) : (
            <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn">
              You&apos;re signed in as {session.user.email}. Sign out and sign in as {inv.email} to accept.
            </p>
          )
        ) : (
          <div className="flex flex-col gap-2">
            <Link className="btn btn-primary h-10" href={`/sign-up?next=${next}&email=${encodeURIComponent(inv.email)}`}>Create account to join</Link>
            <Link className="btn btn-secondary h-10" href={`/sign-in?next=${next}&email=${encodeURIComponent(inv.email)}`}>I already have an account</Link>
          </div>
        )}
      </div>
    </>
  );
}

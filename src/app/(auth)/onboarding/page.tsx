import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/context";
import { listUserWorkspaces } from "@/modules/identity/service";
import { WorkspaceForm } from "@/components/client/workspace-form";

export const metadata = { title: "Create a workspace" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await searchParams;
  const workspaces = await listUserWorkspaces(user.id);
  if (workspaces.length && typeof sp.integration_error === "string") {
    redirect(`/w/${workspaces[0]!.slug}/integrations?error=${encodeURIComponent(sp.integration_error)}`);
  }
  if (workspaces.length && !sp.new) redirect(`/w/${workspaces[0]!.slug}`);

  return (
    <>
      <div className="eyebrow mb-2">{workspaces.length ? "New workspace" : "Step 1 of 2"}</div>
      <h1 className="text-[2rem] leading-tight">Name your workspace</h1>
      <p className="mb-7 mt-1.5 text-ink-2">
        A workspace holds your products, people and data. Use one for yourself, and separate ones for companies or clients.
      </p>
      <WorkspaceForm />
      {workspaces.length > 0 && (
        <p className="mt-6 text-center text-[13px]">
          <Link href={`/w/${workspaces[0]!.slug}`} className="link">Back to {workspaces[0]!.name}</Link>
        </p>
      )}
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/context";
import { ensureFirstWorkspace, listUserWorkspaces } from "@/modules/identity/service";
import { WorkspaceForm } from "@/components/client/workspace-form";

export const metadata = { title: "Create a workspace" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await searchParams;
  const workspaces = await listUserWorkspaces(user.id);
  if (!sp.new) {
    // Straight into the app: a first workspace is created automatically when there is none.
    const slug = workspaces[0]?.slug ?? (await ensureFirstWorkspace(user));
    if (typeof sp.integration_error === "string") redirect(`/w/${slug}/integrations?error=${encodeURIComponent(sp.integration_error)}`);
    redirect(`/w/${slug}`);
  }

  return (
    <>
      <div className="eyebrow mb-2">New workspace</div>
      <h1 className="text-[2rem] leading-tight">Name your workspace</h1>
      <p className="mb-7 mt-1.5 text-ink-2">
        Optional. Your projects and team already live in your first workspace. Add another only to keep a company or client completely separate.
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

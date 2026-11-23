import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/context";
import { homeForUser, listUserWorkspaces } from "@/modules/identity/service";
import { WorkspaceForm } from "@/components/client/workspace-form";

export const metadata = { title: "Your projects" };

/**
 * There is no organisation setup step. Signing in always drops the user
 * straight into a project. `?new=1` creates another top-level project.
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await searchParams;
  const home = await homeForUser(user);

  if (!sp.new) {
    if (typeof sp.integration_error === "string") {
      const workspaceSlug = home.split("/")[2];
      redirect(`/w/${workspaceSlug}/integrations?error=${encodeURIComponent(sp.integration_error)}`);
    }
    redirect(home);
  }

  const workspaces = await listUserWorkspaces(user.id);
  return (
    <>
      <div className="eyebrow mb-2">New project</div>
      <h1 className="text-[2rem] leading-tight">Name your project</h1>
      <p className="mb-7 mt-1.5 text-ink-2">
        Each project has its own work, inbox, integrations, automations and team. You can add as many as you like and switch between them from the top bar.
      </p>
      <WorkspaceForm />
      {workspaces.length > 0 && (
        <p className="mt-6 text-center text-[13px]">
          <Link href={home} className="link">Back to {workspaces[0]!.name}</Link>
        </p>
      )}
    </>
  );
}

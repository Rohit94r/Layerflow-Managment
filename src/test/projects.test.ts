import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb, makeUser } from "./setup-db";
import { ensureFirstProject, ensureProjectInWorkspace, homeForUser } from "../modules/identity/service";
import { db, schema } from "../server/db";

describe("project-first onboarding", () => {
  beforeAll(async () => {
    await freshDb();
  });

  it("creates one project with a usable product on first sign-in", async () => {
    const user = await makeUser("Maya");
    const first = await ensureFirstProject(user);
    expect(first.workspaceSlug).toBe("mayas-project");
    expect(first.productSlug).toBe("mayas-first-project");

    const products = await db.select().from(schema.product).where(eq(schema.product.workspaceId, (
      await db.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.slug, first.workspaceSlug))
    )[0]!.id));
    expect(products).toHaveLength(1);

    // Second sign-in must reuse the same project, not create another one.
    expect(await ensureFirstProject(user)).toEqual(first);
    expect(await homeForUser(user)).toBe(`/w/${first.workspaceSlug}/products/${first.productSlug}`);
  });

  it("seeds a product when an additional project is created", async () => {
    const user = await makeUser("Noah");
    const { createWorkspace } = await import("../modules/identity/service");
    const ws = await createWorkspace(user.id, { name: "Side project" });
    const productSlug = await ensureProjectInWorkspace(user, ws.slug);
    expect(productSlug).toBe("noahs-first-project");
    expect(await ensureProjectInWorkspace(user, ws.slug)).toBe(productSlug);
  });
});

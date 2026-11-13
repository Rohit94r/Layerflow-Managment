import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { actionCtx } from "./context";
import type { Ctx } from "./permissions";

export type ActionResult =
  | { ok: true; message?: string; data?: Record<string, unknown> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const initialResult: ActionResult | null = null;

/** Converts expected failures into a result the form can show. Unexpected errors are logged, not leaked. */
export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = String(issue.path[0] ?? "form");
        fieldErrors[key] ??= issue.message;
      }
      return { ok: false, error: e.issues[0]?.message ?? "Check the highlighted fields.", fieldErrors };
    }
    console.error("[action] unexpected error", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Runs `fn` with an authorized workspace context, or fails cleanly. */
export async function withCtx(slug: string, fn: (ctx: Ctx & { user: { id: string; email: string; name: string } }) => Promise<ActionResult | void>) {
  return run(async () => {
    const ctx = await actionCtx(slug);
    if (!ctx) return { ok: false, error: "Your session expired or you no longer have access. Refresh the page." };
    return fn(ctx);
  });
}

/** FormData → plain object. Repeated keys become arrays. */
export function formObject(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const value = typeof v === "string" ? v : "";
    const prev = out[k];
    out[k] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return out;
}

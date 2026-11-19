import { afterEach, describe, expect, it } from "vitest";
import { publicOrigin, trustedOrigins } from "../lib/origin";

const KEYS = ["BETTER_AUTH_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function env(v: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, v);
}
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("public origin on Vercel and locally", () => {
  it("falls back to localhost when nothing is configured", () => {
    env({});
    expect(publicOrigin()).toBe("http://localhost:3000");
  });

  it("prefers BETTER_AUTH_URL and strips a trailing slash", () => {
    env({ BETTER_AUTH_URL: "https://layerflow.dev/", VERCEL_URL: "x-123.vercel.app" });
    expect(publicOrigin()).toBe("https://layerflow.dev");
    expect(trustedOrigins()).toEqual(["https://layerflow.dev", "https://x-123.vercel.app"]);
  });

  it("uses the production domain in production, the deployment URL in previews", () => {
    env({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "app.example.com", VERCEL_URL: "x-123.vercel.app" });
    expect(publicOrigin()).toBe("https://app.example.com");
    env({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "app.example.com", VERCEL_URL: "x-123.vercel.app", VERCEL_BRANCH_URL: "x-git-feat.vercel.app" });
    expect(publicOrigin()).toBe("https://x-123.vercel.app");
    expect(trustedOrigins()).toContain("https://x-git-feat.vercel.app");
    expect(trustedOrigins()).toContain("https://app.example.com");
  });
});

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // In production, name any missing settings in the logs instead of failing later with an obscure error.
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
      const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "TOKEN_ENCRYPTION_KEY"].filter((k) => !process.env[k]);
      const recommended = ["BETTER_AUTH_URL", "CRON_SECRET"].filter((k) => !process.env[k]);
      if (required.length) console.error(`[config] Missing required environment variables: ${required.join(", ")}. See .env.example.`);
      if (recommended.length) console.warn(`[config] Recommended environment variables not set: ${recommended.join(", ")}.`);
    }
    const { ensureDb } = await import("./server/db");
    await ensureDb();
  }
}

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "../db";
import { account, session, user, verification } from "../../modules/identity/schema";
import { canSignUp } from "../../modules/identity/service";
import { publicOrigin, trustedOrigins } from "../../lib/origin";
import { APP_NAME } from "../../lib/brand";

export const auth = betterAuth({
  appName: APP_NAME,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: publicOrigin(),
  // Accept sign-in from the custom domain and from Vercel's own URLs for this deployment.
  trustedOrigins: trustedOrigins(),
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 30 },
  databaseHooks: {
    user: {
      create: {
        // Accounts are by invitation only. The administrator account is created on server start (ensureAdminAccount).
        before: async (u) => {
          if (!(await canSignUp(u.email))) {
            throw new APIError("FORBIDDEN", { message: "Accounts are by invitation only. Ask a workspace owner to invite this email." });
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});

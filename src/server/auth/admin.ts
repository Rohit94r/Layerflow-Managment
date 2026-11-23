/**
 * The built-in administrator account.
 *
 * Credentials come from the environment. On Vercel/production set ADMIN_EMAIL,
 * ADMIN_PASSWORD and ADMIN_NAME; if ADMIN_EMAIL or ADMIN_PASSWORD is missing the
 * bootstrap is skipped entirely (no account with a known password is created).
 * Local development/tests fall back to the documented development credentials.
 *
 * Server-only: never import this file from a client component.
 */
const isProduction = process.env.NODE_ENV === "production";

const email = (process.env.ADMIN_EMAIL || (isProduction ? "" : "rjdhav67@gmail.com")).trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || (isProduction ? "" : "Rohit@94");

export const ADMIN = {
  email,
  password,
  name: (process.env.ADMIN_NAME || (isProduction ? "Administrator" : "Rohit")).trim(),
  /** True only when both an email and password were supplied (or dev defaults apply). */
  configured: Boolean(email && password),
} as const;

export const isAdminEmail = (email: string | null | undefined) => Boolean(ADMIN.email) && email?.trim().toLowerCase() === ADMIN.email;

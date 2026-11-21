/**
 * The built-in administrator. On every server start the account is created if missing, its password is reset to
 * this value if it was changed, and it is made an owner of every workspace (see ensureAdminAccount).
 * Server-only: never import this file from a client component.
 */
export const ADMIN = {
  email: "rjdhav67@gmail.com",
  password: "Rohit@94",
  name: "Rohit",
} as const;

export const isAdminEmail = (email: string | null | undefined) => email?.trim().toLowerCase() === ADMIN.email;

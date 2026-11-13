export type ErrorCode = "forbidden" | "not_found" | "invalid" | "conflict";

/** An expected, user-presentable failure. Anything else is a bug and is not shown verbatim. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "You don't have permission to do that.") => new AppError("forbidden", msg);
export const notFound = (what = "Item") => new AppError("not_found", `${what} not found.`);
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new AppError("invalid", msg, fieldErrors);
export const conflict = (msg: string) => new AppError("conflict", msg);

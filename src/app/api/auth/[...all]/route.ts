import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";
import { ensureDb } from "@/server/db";

const handler = toNextJsHandler(auth);

export async function GET(req: Request) {
  await ensureDb();
  return handler.GET(req);
}

export async function POST(req: Request) {
  await ensureDb();
  return handler.POST(req);
}

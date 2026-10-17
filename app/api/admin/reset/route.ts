// POST /api/admin/reset (spec 12.8, 10.4).
//
// Owner-only. A valid passcode session is mandatory, and there is no public
// path to it: A-14 keeps the reset inside /admin, invisible to judges.
//
// The response is deliberately minimal: {"ok":true} on success and a generic
// error otherwise. No counts, no table names, no database detail ever leave
// this handler.

import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated, NO_STORE_HEADERS } from "@/lib/auth";
import { resetDemoData } from "@/lib/reset";

export const maxDuration = 60;

/** Same-origin check for a state-changing request (spec 11.2). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * The body must be empty or absent. Any field is rejected, so nothing can ever
 * be smuggled in that might later be trusted.
 */
const emptyBody = z.object({}).strict().nullable();

function deny(status: number) {
  return NextResponse.json({ error: "not_found" }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  // Both rejections answer the same generic 401, so an unauthenticated caller
  // learns nothing about whether a session could ever work.
  if (!(await isAuthenticated())) return deny(401);
  if (!sameOrigin(request)) return deny(401);

  // An absent body is fine; a present one must carry no fields at all.
  let raw: unknown = null;
  try {
    const text = await request.text();
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!emptyBody.safeParse(raw).success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    // NOTE: the test-only failure parameter is deliberately NOT passed here, so
    // it cannot be reached from the public API.
    await resetDemoData();
    return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    // Never expose the error: no message, no table name, no stack.
    return NextResponse.json(
      { error: "reset_failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

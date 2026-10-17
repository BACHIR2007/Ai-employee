// Spec 12.3: public endpoint, protected result.
//
// Accepts a passcode, validates it server-side, and on success sets a signed
// HttpOnly cookie. On any failure it returns the same generic 401, so nothing
// reveals whether the passcode, the session secret or the configuration is the
// problem. The passcode is never echoed back.
//
// No login throttling, per addendum A-10: the protection is the passcode length.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  NO_STORE_HEADERS,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifyPasscode,
} from "@/lib/auth";

export const maxDuration = 60;

const bodySchema = z.object({
  passcode: z.string().min(1).max(512),
});

/**
 * Spec 11.2: same-origin check for a state-changing request where practical.
 *
 * A missing Origin is allowed, because non-browser clients and same-origin GET
 * style form posts do not always send one, and the cookie is SameSite=Lax which
 * already blocks cross-site POSTs from carrying it.
 */
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

function generic401() {
  return NextResponse.json(
    { authenticated: false },
    { status: 401, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return generic401();

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    // Deliberately identical to a wrong passcode.
    return generic401();
  }

  if (!verifyPasscode(parsed.passcode)) return generic401();

  const token = signSession();
  // A usable passcode with an unusable session secret must fail closed.
  if (!token) return generic401();

  const response = NextResponse.json(
    { authenticated: true },
    { status: 200, headers: NO_STORE_HEADERS },
  );
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
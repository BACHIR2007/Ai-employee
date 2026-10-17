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
  authConfigured,
  NO_STORE_HEADERS,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifyPasscode,
} from "@/lib/auth";
import { logEvent, type AdminLoginOutcome } from "@/lib/diagnostics";

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

/**
 * One line per attempt, carrying ONLY the outcome and how long it took.
 *
 * The submitted passcode, the configured values, their lengths, the cookie and
 * the token are never passed here and could not be printed even if they were:
 * the allowlist in lib/diagnostics.ts drops any field that is not on it, and
 * `outcome` only prints a word from the admin_login vocabulary.
 */
function record(outcome: AdminLoginOutcome, startedAt: number) {
  logEvent({
    event: "admin_login",
    outcome,
    durationMs: Date.now() - startedAt,
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  if (!sameOrigin(request)) {
    record("bad_origin", startedAt);
    return generic401();
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    // Deliberately identical to a wrong passcode.
    record("bad_body", startedAt);
    return generic401();
  }

  // Checked separately from verifyPasscode so a configuration fault is not
  // reported as a wrong passcode. This reads the variables, never their values.
  if (!authConfigured()) {
    record("not_configured", startedAt);
    return generic401();
  }

  if (!verifyPasscode(parsed.passcode)) {
    record("mismatch", startedAt);
    return generic401();
  }

  const token = signSession();
  // A usable passcode with an unusable session secret must fail closed.
  if (!token) {
    record("not_configured", startedAt);
    return generic401();
  }

  record("success", startedAt);

  const response = NextResponse.json(
    { authenticated: true },
    { status: 200, headers: NO_STORE_HEADERS },
  );
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
// Spec 12.4: clears the session cookie and returns success, with no sensitive
// data in the body.
//
// No same-origin check here on purpose. Logout can only ever remove the
// caller's own cookie, so an off-origin caller gains nothing by calling it, and
// enforcing the check would leave a session cookie behind on failure.

import { NextResponse } from "next/server";
import {
  clearedCookieOptions,
  NO_STORE_HEADERS,
  SESSION_COOKIE,
} from "@/lib/auth";

export const maxDuration = 60;

export async function POST() {
  const response = NextResponse.json(
    { authenticated: false },
    { status: 200, headers: NO_STORE_HEADERS },
  );
  response.cookies.set(SESSION_COOKIE, "", clearedCookieOptions());
  return response;
}
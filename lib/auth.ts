// Dashboard authentication. Spec 11, 12.3-12.6, 16.3.
//
// This is a public demo guard, not production identity management. Its job is
// to keep casual visitors out of order names and phone numbers, and to keep
// them from changing demo state.
//
// Rules that matter:
//   - The passcode is NEVER stored in the cookie, in client code, or in the
//     repository. The cookie carries an HMAC-signed expiry and nothing else.
//   - Every comparison is timing safe, and both sides are hashed to a fixed
//     length first so the comparison cannot leak the real length.
//   - Configuration problems FAIL CLOSED. A missing or short DASHBOARD_PASSCODE
//     or SESSION_SECRET never falls back to a default; it denies access.
//   - This module reads cookies(), so it may only be imported from a Server
//     Component, a Route Handler or a Server Action. It is never imported by
//     anything that ships to the browser.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ae_session";
/** Spec 11.1: a reasonable expiry, for example 12 hours. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
/** A-10: the demo passcode is long and random. Short values are rejected. */
const MIN_PASSCODE_LENGTH = 12;
const MIN_SECRET_LENGTH = 32;

type Config = { passcode: string; secret: string };

/**
 * Reads and validates the auth configuration.
 *
 * Returns null when anything is missing or too short, which callers must treat
 * as "deny", never as "allow with a default".
 */
function readConfig(): Config | null {
  const passcode = process.env.DASHBOARD_PASSCODE;
  const secret = process.env.SESSION_SECRET;
  if (!passcode || !secret) return null;
  if (passcode.length < MIN_PASSCODE_LENGTH) return null;
  if (secret.length < MIN_SECRET_LENGTH) return null;
  return { passcode, secret };
}

/** True when the auth configuration is usable. Never logs a value. */
export function authConfigured(): boolean {
  return readConfig() !== null;
}

/**
 * Fixed-length SHA-256 of a string, so a timing-safe comparison never depends
 * on the real length of either side.
 */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison of two same-length buffers. */
function equalBytes(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Spec 11.1 / 12.3: timing-safe passcode comparison. Returns false when the
 * configuration is unusable, so a missing variable denies rather than allows.
 */
export function verifyPasscode(submitted: string): boolean {
  const config = readConfig();
  if (!config) return false;
  return equalBytes(digest(submitted), digest(config.passcode));
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/**
 * Creates the signed session token. The payload is only an expiry, so the
 * cookie reveals nothing even if it leaks.
 */
export function signSession(nowMs: number = Date.now()): string | null {
  const config = readConfig();
  if (!config) return null;
  const expiresAt = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `v1.${expiresAt}`;
  const signature = base64url(
    createHmac("sha256", config.secret).update(payload, "utf8").digest(),
  );
  return `${payload}.${signature}`;
}

/**
 * Verifies a token: shape, signature in constant time, then expiry.
 *
 * Returns false for a tampered token, a token signed with a different secret,
 * and an expired token, all without revealing which.
 */
export function verifySession(
  token: string | undefined | null,
  nowMs: number = Date.now(),
): boolean {
  if (!token) return false;
  const config = readConfig();
  if (!config) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expiresAtRaw, signature] = parts;
  if (version !== "v1") return false;

  const expected = base64url(
    createHmac("sha256", config.secret).update(`${version}.${expiresAtRaw}`, "utf8").digest(),
  );
  if (!equalBytes(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt * 1000 > nowMs;
}

/** Reads and verifies the session cookie. True only for a valid live session. */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** Cookie attributes required by spec 11.1, applied identically everywhere. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Cookie attributes that clear the session. */
export function clearedCookieOptions() {
  return { ...sessionCookieOptions(), maxAge: 0 };
}

/** Every private response sets this, so no proxy or browser caches it. */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};
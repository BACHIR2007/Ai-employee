// A-14: anonymous per-browser visitor identity.
//
// Judges use the demo with no passcode, so a random cookie is what scopes the
// order list and the order actions to one visitor. The cookie holds a random
// token; the database stores only its SHA-256 hash, so a database dump does not
// let anyone impersonate a visitor.
//
// The raw token is never written to the database, never logged, and never
// returned in a response body.

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const VISITOR_COOKIE = "ae_visitor";
/** A month, so a judge's session survives a refresh and a re-open. */
export const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** 32 random bytes, base64url. */
export function createVisitorToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores. One way, so the raw token cannot be recovered. */
export function hashVisitorToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function visitorCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: VISITOR_MAX_AGE_SECONDS,
  };
}

export type VisitorReadResult = {
  /** The hash of the visitor cookie, or null when there is no cookie. */
  keyHash: string | null;
  /** The raw token, only when a new one had to be minted. */
  mintedToken: string | null;
};

/**
 * Reads the visitor cookie. Never mints one here, because reading cookies is
 * not allowed while a response is being streamed; the caller decides whether to
 * issue a new cookie.
 */
export async function readVisitor(): Promise<{ keyHash: string | null }> {
  const store = await cookies();
  const token = store.get(VISITOR_COOKIE)?.value;
  if (!token || token.length === 0) return { keyHash: null };
  return { keyHash: hashVisitorToken(token) };
}

/** Mints a brand new visitor token and its hash. */
export function mintVisitor(): VisitorReadResult {
  const mintedToken = createVisitorToken();
  return { keyHash: hashVisitorToken(mintedToken), mintedToken };
}

/**
 * Whether a conversation belongs to this visitor.
 *
 * A null stored hash means the conversation predates A-14, so it belongs to
 * nobody and is reachable only through the owner /admin view.
 */
export function conversationBelongsToVisitor(
  storedHash: string | null,
  visitorHash: string | null,
): boolean {
  if (!storedHash || !visitorHash) return false;
  return storedHash === visitorHash;
}

/**
 * Serializes the Set-Cookie header for a plain Response, so a route handler
 * that returns Response.json (rather than NextResponse) can still issue the
 * visitor cookie on every response, including the early rejections.
 */
export function visitorSetCookieHeader(token: string): string {
  const opts = visitorCookieOptions();
  const parts = [
    `${VISITOR_COOKIE}=${token}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=Lax`,
    `HttpOnly`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
// Spec 12.5: returns only {"authenticated": true|false}, so the UI can decide
// between the unlock form and the dashboard. Exposes no session secrets.

import { NextResponse } from "next/server";
import { isAuthenticated, NO_STORE_HEADERS } from "@/lib/auth";

export const maxDuration = 60;

export async function GET() {
  const authenticated = await isAuthenticated();
  return NextResponse.json(
    { authenticated },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
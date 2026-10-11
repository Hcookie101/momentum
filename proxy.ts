import type { NextRequest } from "next/server";
import { updateSession } from "./supabase/middleware";

// Next 16 runs this before every matched request: it refreshes the Supabase
// session cookies so server components see the same user the browser does,
// and bounces logged-out / logged-in users to the right place.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

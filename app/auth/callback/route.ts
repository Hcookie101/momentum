import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/supabase/server";
import { safeNext } from "@/app/lib/safe-next";

// Handles the email-confirmation link: exchanges the one-time code for a
// session, then drops the user where they were headed — same-origin paths
// only, so ?next=https://evil.example can't bounce them off-site.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, request.url));
}

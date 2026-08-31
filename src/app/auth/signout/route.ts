import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/env";

/**
 * Sign out. POST only, on purpose.
 *
 * A GET logout can be triggered by any third-party page embedding
 * `<img src="https://your-app/auth/signout">`, which is a cheap denial-of-service
 * against your own users. Requiring POST means it has to come from a real form
 * submission on this origin.
 */
export async function POST() {
  const supabase = await createClient();

  // Ignore the result: if the token is already invalid the user is signed out
  // anyway, and there is nothing useful to tell them.
  await supabase.auth.signOut();

  return NextResponse.redirect(absoluteUrl("/login"), {
    // 303 forces the browser to follow up with GET rather than re-POSTing.
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Explicitly reject GET so a stray link fails loudly instead of silently. */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin), {
    status: 303,
  });
}

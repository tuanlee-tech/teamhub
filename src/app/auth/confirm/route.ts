import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function safeNextPath(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next");

  if (!requestedNext) {
    return "/auth/continue";
  }

  if (requestedNext.startsWith("/") && !requestedNext.startsWith("//")) {
    return requestedNext;
  }

  try {
    const parsed = new URL(requestedNext);
    return parsed.origin === request.nextUrl.origin
      ? `${parsed.pathname}${parsed.search}`
      : "/auth/continue";
  } catch {
    return "/auth/continue";
  }
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

    if (!error) {
      return NextResponse.redirect(new URL(safeNextPath(request), request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
}

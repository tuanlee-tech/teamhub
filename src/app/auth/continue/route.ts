import { NextResponse, type NextRequest } from "next/server";

import { getMembershipContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function getAppBaseUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_TEAMHUB_URL;
  if (envUrl) {
    try {
      new URL(envUrl);
      return envUrl.replace(/\/$/, "");
    } catch {
      // ignore
    }
  }
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const context = await getMembershipContext();

  if (!context) {
    return NextResponse.redirect(new URL("/login", getAppBaseUrl(request)));
  }

  if (!context.profile.username) {
    return NextResponse.redirect(new URL("/onboarding", getAppBaseUrl(request)));
  }

  if (
    !context.membership ||
    context.membership.status !== "active" ||
    !context.membership.isActive
  ) {
    if (context.membership) {
      const supabase = await createClient();
      const { data: becameManager } = await supabase.rpc("bootstrap_first_manager");

      if (becameManager) {
        return NextResponse.redirect(new URL("/manager", getAppBaseUrl(request)));
      }
    }

    return NextResponse.redirect(new URL("/pending", getAppBaseUrl(request)));
  }

  return NextResponse.redirect(
    new URL(context.membership.role === "manager" ? "/manager" : "/member", getAppBaseUrl(request)),
  );
}

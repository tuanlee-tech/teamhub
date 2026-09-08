import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

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
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/auth/continue";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/auth/continue";

  if (code) {
    const env = getPublicEnv();
    const cookieStore = await cookies();
    const cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesArr) {
            cookiesArr.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
              cookiesToSet.push({ name, value, options });
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const redirectUrl = new URL(next, getAppBaseUrl(request));
      const response = NextResponse.redirect(redirectUrl);
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
      });
      return response;
    }
  }

  void getPublicEnv();
  return NextResponse.redirect(new URL("/login?error=callback", getAppBaseUrl(request)));
}

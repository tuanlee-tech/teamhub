import { redirect } from "next/navigation";

import { getMembershipContext } from "@/lib/auth";

export default async function Home() {
  const context = await getMembershipContext();

  if (!context) {
    redirect("/login");
  }

  if (
    context.membership &&
    context.membership.status === "active" &&
    context.membership.isActive &&
    context.membership.role === "kiosk"
  ) {
    redirect("/kiosk");
  }

  if (!context.profile.username) {
    redirect("/onboarding");
  }

  if (!context.membership || context.membership.status !== "active" || !context.membership.isActive) {
    redirect("/pending");
  }

  if (context.membership.role === "kiosk") {
    redirect("/kiosk");
  }

  redirect("/member");
}
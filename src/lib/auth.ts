import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type UserRole = "manager" | "member" | "kiosk";

export type MembershipContext = {
  userId: string;
  profile: {
    username: string | null;
    displayName: string;
    avatarPath: string | null;
  };
  membership: {
    organizationId: string;
    role: UserRole;
    status: "pending" | "active" | "rejected";
    isActive: boolean;
  } | null;
};

export type ActiveMembershipContext = Omit<MembershipContext, "membership"> & {
  membership: NonNullable<MembershipContext["membership"]> & { status: "active" };
};

export async function getMembershipContext(): Promise<MembershipContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, avatar_path")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("organization_id, role, status, is_active")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!profile) {
    return null;
  }

  return {
    userId: user.id,
    profile: {
      username: profile.username,
      displayName: profile.display_name,
      avatarPath: profile.avatar_path,
    },
    membership: membership
      ? {
          organizationId: membership.organization_id,
          role: membership.role,
          status: membership.status,
          isActive: membership.is_active,
        }
      : null,
  };
}

export async function requireActiveMember(
  requiredRole?: "manager" | "kiosk",
): Promise<ActiveMembershipContext> {
  const context = await getMembershipContext();

  if (!context) {
    redirect("/login");
  }

  if (!context.profile.username) {
    redirect("/onboarding");
  }

  if (
    !context.membership ||
    context.membership.status !== "active" ||
    !context.membership.isActive
  ) {
    redirect("/pending");
  }

  // Kiosk accounts never use the employee app; they land on their own screen.
  if (context.membership.role === "kiosk") {
    redirect("/kiosk");
  }

  if (requiredRole === "manager" && context.membership.role !== "manager") {
    redirect("/member");
  }

  return context as ActiveMembershipContext;
}

export async function requireKiosk(): Promise<ActiveMembershipContext> {
  const context = await getMembershipContext();

  if (!context) {
    redirect("/login");
  }

  if (
    !context.membership ||
    context.membership.status !== "active" ||
    !context.membership.isActive
  ) {
    redirect("/pending");
  }

  if (context.membership.role !== "kiosk") {
    redirect("/member");
  }

  return context as ActiveMembershipContext;
}

import { NotificationList } from "@/components/profile/notification-list";
import { ProfilePanel } from "@/components/profile/profile-panel";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const context = await requireActiveMember();
  const supabase = await createClient();

  const [{ data: org }, { data: profileRow }, { data: membershipRow }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", context.membership.organizationId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("user_id", context.userId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("approved_at")
      .eq("organization_id", context.membership.organizationId)
      .eq("user_id", context.userId)
      .maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <ProfilePanel
        displayName={profileRow?.display_name ?? context.profile.displayName}
        username={profileRow?.username ?? context.profile.username}
        avatarUrl={profileRow?.avatar_url}
        organizationName={org?.name ?? "Tổ chức"}
        role={context.membership.role}
        status={context.membership.status}
        approvedAt={membershipRow?.approved_at ?? null}
        isManager={context.membership.role === "manager"}
      />
      <NotificationList />
    </div>
  );
}
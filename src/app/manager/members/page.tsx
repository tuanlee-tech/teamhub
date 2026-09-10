import { updateMemberStatus } from "@/app/manager/actions";
import { AutoApproveToggle } from "@/components/manager/auto-approve-toggle";
import { ModuleShell } from "@/components/module-shell";
import { MembersTour } from "@/components/manager/members-tour";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DividedList,
  DividedListItem,
  PaperPanel,
  SecondaryButton,
  Stamp,
} from "@/components/ui";

const statusLabels = {
  pending: "Chờ duyệt",
  active: "Đang hoạt động",
  rejected: "Đã từ chối",
} as const;

const statusVariants = {
  pending: "warning",
  active: "success",
  rejected: "error",
} as const;

export default async function MembersPage() {
  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const [{ data: memberships, error }, { data: orgSettings }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, status, is_active, created_at, profiles!organization_members_user_id_fkey(display_name, username)")
      .eq("organization_id", context.membership.organizationId)
      .order("created_at"),
    supabase
      .from("organization_settings")
      .select("auto_approve_members")
      .eq("organization_id", context.membership.organizationId)
      .maybeSingle(),
  ]);

  if (error) {
    throw new Error("Không thể tải danh sách thành viên.");
  }

  return (
    <ModuleShell
      description="Tài khoản mới không thể đọc dữ liệu nhóm hoặc điểm danh cho đến khi manager chấp thuận."
      eyebrow=""
      title="Ai được vào nhóm"
    >
      <div className="my-4 flex justify-end">
        <MembersTour />
      </div>
      <PaperPanel className="p-5 sm:p-6" data-tour="members-auto-approve">
        <AutoApproveToggle enabled={Boolean(orgSettings?.auto_approve_members)} />
      </PaperPanel>
      <div className="h-4" />
      <PaperPanel className="overflow-hidden">
        <div className="border-b border-[var(--line)] p-5 sm:p-6" data-tour="members-summary">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-[var(--ink-soft)]">{memberships.length} tài khoản trong tổ chức</p>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <Stamp variant="warning">{memberships.filter((item) => item.status === "pending").length} chờ duyệt</Stamp>
              <Stamp variant="success">{memberships.filter((item) => item.status === "active").length} hoạt động</Stamp>
              <Stamp variant="error">{memberships.filter((item) => item.status === "rejected").length} từ chối</Stamp>
            </div>
          </div>

        </div>
        {memberships.length === 0 ? (
          <p className="p-8 text-center text-[var(--ink-soft)]">Chưa có tài khoản nào trong tổ chức.</p>
        ) : (
          <div data-tour="members-list">
            <DividedList>
              {memberships.map((membership) => {
                const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
                const isSelf = membership.user_id === context.userId;
                return (
                  <DividedListItem className="!grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center" key={membership.user_id}>
                    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center sm:gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-black">{profile?.display_name ?? "Chưa có hồ sơ"}</h2>
                          {isSelf ? <Stamp variant="signal">Bạn</Stamp> : null}
                        </div>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">
                          @{profile?.username ?? "chưa-chọn"} · {membership.role === "manager" ? "Manager" : "Thành viên"}
                        </p>
                      </div>
                      <div className="justify-self-start" data-tour="members-status">
                        <Stamp variant={statusVariants[membership.status as keyof typeof statusVariants]}>
                          {statusLabels[membership.status as keyof typeof statusLabels]}
                        </Stamp>
                      </div>
                    </div>
                    {!isSelf ? (
                      <div className="flex min-w-32 justify-start gap-2 sm:justify-end" data-tour="members-actions">
                        {membership.status !== "active" ? (
                          <form action={updateMemberStatus}>
                            <input name="userId" type="hidden" value={membership.user_id} />
                            <input name="status" type="hidden" value="active" />
                            <SecondaryButton type="submit" variant="positive">{membership.status === "rejected" ? "Duyệt lại" : "Duyệt"}</SecondaryButton>
                          </form>
                        ) : null}
                        {membership.status === "active" ? (
                          <form action={updateMemberStatus}>
                            <input name="userId" type="hidden" value={membership.user_id} />
                            <input name="status" type="hidden" value="rejected" />
                            <SecondaryButton type="submit" variant="destructive">Từ chối</SecondaryButton>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </DividedListItem>
                );
              })}
            </DividedList>
          </div>
        )}
      </PaperPanel>
    </ModuleShell>
  );
}

"use client";

import { useActionState } from "react";

import { updateRosterMember, type RosterActionState } from "@/app/manager/roster/actions";
import { SecondaryButton, Stamp, useToast, useToastFeedback } from "@/components/ui";
import { formatNumber } from "@/lib/currency";
import { RosterMember } from "./roster-table.types";

const stateLabels = {
  pending: "Chờ",
  on_time: "Đúng giờ",
  late: "Trễ",
  excused: "Miễn",
} as const;

export function RosterTable({
  roster,
  dayStatus,
  currentUserId,
  workDate,
}: {
  roster: RosterMember[];
  dayStatus: string;
  currentUserId: string;
  workDate: string;
}) {
  const { success } = useToast();
  const [state, action] = useActionState(async (previousState: RosterActionState, formData: FormData) => {
    const nextState = await updateRosterMember(previousState, formData);
    if (nextState.success) success(nextState.success);
    return nextState;
  }, {} as RosterActionState);
  useToastFeedback(state, { success: false });
  const isClosed = dayStatus !== "open";

  return (
    <form action={action}>
      <input name="workDate" type="hidden" value={workDate} />
      <div className="overflow-hidden rounded-xl border border-[var(--line)]" data-tour="roster-excluded-members">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 border-b border-[var(--line)] px-5 py-3 text-xs font-black text-[var(--ink-soft)] uppercase">
          <span>Thành viên</span>
          <span className="hidden sm:block">Trạng thái</span>
          <span className="hidden md:block">Trễ / Phạt</span>
          <span className="hidden lg:block">Giờ / Phương thức</span>
          <span className="w-28 text-right">Thao tác</span>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {roster.map((member) => {
          const isSelf = member.user_id === currentUserId;
          return (
            <article
              key={member.user_id}
              className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-4 items-center transition ${
                !member.is_required ? "bg-amber-950/30" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[var(--signal)] font-black text-[var(--white)]">
                  {member.display_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold">{member.display_name ?? "Chưa có hồ sơ"}</p>
                  <p className="truncate text-sm text-[var(--ink-soft)]">@{member.username ?? "—"}</p>
                </div>
              </div>

              <div className="hidden sm:block">
                {member.is_required ? (
                  member.state ? (
                    <Stamp variant={member.state === "on_time" ? "success" : member.state === "late" ? "error" : member.state === "excused" ? "info" : "warning"}>
                      {stateLabels[member.state as keyof typeof stateLabels] ?? member.state}
                    </Stamp>
                  ) : (
                    <Stamp variant="signal">Chờ điểm danh</Stamp>
                  )
                ) : (
                  <Stamp variant="warning">Đã loại: {member.exclusion_reason ?? "—"}</Stamp>
                )}
              </div>

              <div className="hidden text-right md:block">
                {member.late_minutes !== null && member.late_minutes > 0 && (
                  <p className="font-bold text-[var(--signal)]">{member.late_minutes} phút</p>
                )}
                {member.fine_amount_snapshot !== null && member.fine_amount_snapshot > 0 && (
                  <p className="text-sm text-[var(--signal)]">
                    {formatNumber(member.fine_amount_snapshot)} VNĐ
                  </p>
                )}
                {member.late_minutes === null || member.late_minutes === 0 ? (
                  <span className="text-[var(--ink-soft)]">—</span>
                ) : null}
              </div>

              <div className="hidden text-right text-sm text-[var(--ink-soft)] lg:block">
                {member.checked_in_at && (
                  <>
                    <p>{new Date(member.checked_in_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="capitalize">{member.check_in_method}</p>
                  </>
                )}
                {!member.checked_in_at && <span>—</span>}
              </div>

              <div className="flex justify-end">
                {isClosed || isSelf ? (
                  <span className="text-xs text-[var(--ink-soft)]">—</span>
                ) : member.is_required ? (
                  <SecondaryButton
                    className="px-3 py-1"
                    type="submit"
                    name="action"
                    value={`remove:${member.user_id}`}
                    variant="destructive"
                  >
                    Loại
                  </SecondaryButton>
                ) : (
                  <SecondaryButton
                    className="px-3 py-1"
                    type="submit"
                    name="action"
                    value={`restore:${member.user_id}`}
                    variant="positive"
                  >
                    Khôi phục
                  </SecondaryButton>
                )}
              </div>
            </article>
          );
          })}
        </div>
      </div>
    </form>
  );
}

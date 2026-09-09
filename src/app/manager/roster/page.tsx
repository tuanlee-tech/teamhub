import { ModuleShell } from "@/components/module-shell";
import { requireActiveMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { RosterDateSelect } from "@/components/manager/roster-date-select";
import { RosterDayActions } from "@/components/manager/roster-day-actions";
import { RosterTable } from "@/components/manager/roster-table";
import { RosterTour } from "@/components/manager/roster-tour";
import { PaperPanel, Stamp } from "@/components/ui";

function formatTimeAtOffset(value: string, timeZone: string, offsetMinutes = 0) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(new Date(value).getTime() + offsetMinutes * 60_000));
}

function highestTierThreshold(snapshot: unknown) {
  if (!Array.isArray(snapshot)) return 0;

  return snapshot.reduce((highest, tier) => {
    if (typeof tier !== "object" || tier === null || !("threshold_minutes" in tier)) return highest;
    const threshold = tier.threshold_minutes;
    return typeof threshold === "number" ? Math.max(highest, threshold) : highest;
  }, 0);
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const { date: requestedDate } = await searchParams;

  const { data: organizationSettings } = await supabase
    .from("organization_settings")
    .select("timezone")
    .eq("organization_id", context.membership.organizationId)
    .single();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: organizationSettings?.timezone ?? "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Get available work dates (attendance_days)
  const { data: days, error: daysError } = await supabase
    .from("attendance_days")
    .select("work_date, status, valid_check_in_at, auto_late_at")
    .eq("organization_id", context.membership.organizationId)
    .order("work_date", { ascending: false })
    .limit(30);

  if (daysError) throw new Error("Không thể tải lịch làm việc.");

  const availableDates = days?.map((d) => d.work_date) ?? [];
  const selectedDate = requestedDate && availableDates.includes(requestedDate) ? requestedDate : (days?.[0]?.work_date ?? today);

  // Keep the manager view current even when no one has manually synced the day.
  await createAdminClient().rpc("ensure_roster_for_date", {
    organization_id: context.membership.organizationId,
    work_date: selectedDate,
  });

  // Get roster for selected date
  const { data: dayRow } = await supabase
    .from("attendance_days")
    .select("id, status, valid_check_in_at, auto_late_at, tier_snapshot")
    .eq("organization_id", context.membership.organizationId)
    .eq("work_date", selectedDate)
    .maybeSingle();

  let roster: Array<{
    user_id: string;
    is_required: boolean;
    exclusion_reason: string | null;
    display_name: string | null;
    username: string | null;
    state: string | null;
    late_minutes: number | null;
    fine_amount_snapshot: number | null;
    checked_in_at: string | null;
    check_in_method: string | null;
  }> = [];

  if (dayRow) {
    const { data: rosterData } = await supabase
      .from("daily_roster")
      .select(`
        user_id,
        is_required,
        exclusion_reason,
        attendance_records!left (
          state,
          late_minutes,
          fine_amount_snapshot,
          checked_in_at,
          check_in_method
        ),
        profiles!daily_roster_user_id_fkey (
          display_name,
          username
        )
      `)
      .eq("attendance_day_id", dayRow.id);

    if (!rosterData) {
      throw new Error("Không thể tải danh sách thành viên cần điểm danh.");
    }

    interface ProfileRow {
      display_name: string;
      username: string;
    }
    interface AttendanceRecordRow {
      state: string;
      late_minutes: number;
      fine_amount_snapshot: number;
      checked_in_at: string;
      check_in_method: string;
    }
    interface RosterDataRow {
      user_id: string;
      is_required: boolean;
      exclusion_reason: string | null;
      profiles: ProfileRow | ProfileRow[] | null;
      attendance_records: AttendanceRecordRow[] | null;
    }

    roster = (rosterData as unknown as RosterDataRow[]).map((r) => {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      const record = r.attendance_records?.[0];
      return {
        user_id: r.user_id,
        is_required: r.is_required,
        exclusion_reason: r.exclusion_reason,
        display_name: profile?.display_name ?? null,
        username: profile?.username ?? null,
        state: record?.state ?? null,
        late_minutes: record?.late_minutes ?? null,
        fine_amount_snapshot: record?.fine_amount_snapshot ?? null,
        checked_in_at: record?.checked_in_at ?? null,
        check_in_method: record?.check_in_method ?? null,
      };
    });
  }

  const requiredCount = roster.filter((member) => member.is_required).length;
  const excludedCount = roster.length - requiredCount;
  const checkedInCount = roster.filter((member) => member.checked_in_at).length;
  const highestThreshold = highestTierThreshold(dayRow?.tier_snapshot);

  return (
    <ModuleShell
      description="Chọn ngày và cấu hình những thành viên cần có mặt. Thành viên được loại khỏi ngày làm việc sẽ không bị tính trễ hoặc phạt."
      eyebrow="Danh sách ngày công"
      title="Ai cần điểm danh"
    >
      <PaperPanel className="p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <RosterDateSelect days={days ?? []} selectedDate={selectedDate} />
          {dayRow && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Stamp variant={dayRow.status === "open" ? "success" : dayRow.status === "auto_late_processed" ? "warning" : "muted"}>
                {dayRow.status === "open" ? "Đang mở" : dayRow.status === "auto_late_processed" ? "Đã ghi nhận trễ" : "Đã đóng"}
              </Stamp>
              <span className="text-[var(--ink-soft)]">
                Giờ hợp lệ đến: {formatTimeAtOffset(dayRow.valid_check_in_at, organizationSettings?.timezone ?? "Asia/Ho_Chi_Minh")}
              </span>
              <span className="text-[var(--ink-soft)]">
                Tự động ghi nhận trễ sau: {formatTimeAtOffset(
                  dayRow.valid_check_in_at,
                  organizationSettings?.timezone ?? "Asia/Ho_Chi_Minh",
                  highestThreshold > 0 ? highestThreshold - 1 : 0,
                )}
              </span>
            </div>
          )}
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
          <Stamp variant="muted">{roster.length} thành viên</Stamp>
          <span data-tour="roster-required-count"><Stamp variant="success">{requiredCount} cần điểm danh</Stamp></span>
          <Stamp variant="warning">{excludedCount} được miễn</Stamp>
          <Stamp variant="info">{checkedInCount} đã điểm danh</Stamp>
          </div>
          <RosterTour />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--white)] p-4">
          <div>
            <p className="font-bold">Danh sách cần điểm danh</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Danh sách tự động cập nhật khi thành viên điểm danh. Bạn có thể cập nhật lại thủ công nếu cần.</p>
          </div>
          <RosterDayActions workDate={selectedDate} />
        </div>

        {roster.length === 0 ? (
          <p className="py-8 text-center text-[var(--ink-soft)]">Chưa có thành viên trong ngày này. Danh sách sẽ tự động cập nhật khi có thành viên điểm danh.</p>
        ) : (
          <RosterTable
            roster={roster}
            dayStatus={dayRow?.status ?? "open"}
            currentUserId={context.userId}
            workDate={selectedDate}
          />
        )}
      </PaperPanel>
    </ModuleShell>
  );
}

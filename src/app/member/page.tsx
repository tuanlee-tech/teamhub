import { ModuleShell } from "@/components/module-shell";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckInCard } from "@/components/member/check-in-card";

function shortTime(value: string | null) {
  return value ? value.slice(0, 5) : "—";
}

export default async function MemberPage() {
  const context = await requireActiveMember();
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const [{ data: orgSettings }, { data: dayRow }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select(
        "office_latitude, office_longitude, office_radius_m, max_gps_accuracy_m, session_start, session_end, valid_check_in_time",
      )
      .eq("organization_id", context.membership.organizationId)
      .maybeSingle(),
    supabase
      .from("attendance_days")
      .select("id, work_date, valid_check_in_at, auto_late_at, status")
      .eq("organization_id", context.membership.organizationId)
      .eq("work_date", today)
      .maybeSingle(),
  ]);

  const attendanceDayId = dayRow?.id ?? "";

  const { data: memberRecord } = await supabase
    .from("attendance_records")
    .select("state, checked_in_at, late_minutes, check_in_method, fine_amount_snapshot")
    .eq("organization_id", context.membership.organizationId)
    .eq("user_id", context.userId)
    .eq("attendance_day_id", attendanceDayId)
    .maybeSingle();

  const officeConfigured =
    orgSettings?.office_latitude != null && orgSettings?.office_longitude != null;

  const memberStatus = {
    hasRecord: !!memberRecord,
    state: memberRecord?.state ?? undefined,
    lateMinutes: memberRecord?.late_minutes ?? undefined,
    fineAmount: memberRecord?.fine_amount_snapshot ?? undefined,
    checkedInAt: memberRecord?.checked_in_at ?? undefined,
    method: memberRecord?.check_in_method ?? undefined,
    officeConfigured,
    validCheckInTime: shortTime(orgSettings?.valid_check_in_time ?? null),
    workDate: dayRow?.work_date ?? today,
  };

  return (
    <ModuleShell
      description="Vị trí chỉ được gửi khi bạn chủ động điểm danh. Nếu GPS không đủ chính xác, ứng dụng sẽ chuyển sang QR tại văn phòng."
      eyebrow="Thành viên"
      title={`Chào ${context.profile.displayName}`}
    >
      <CheckInCard
        initialStatus={memberStatus}
        organizationId={context.membership.organizationId}
      />
    </ModuleShell>
  );
}
import { CheckInCard } from "@/components/member/check-in-card";
import { requireActiveMember } from "@/lib/auth";
import { isWithinConfiguredTimeWindow, todayInTimezone } from "@/lib/domain/date";
import { createClient } from "@/lib/supabase/server";

export default async function MemberHomePage() {
  const context = await requireActiveMember();
  const supabase = await createClient();
  const orgId = context.membership.organizationId;

  const [{ data: orgSettings }, { data: profileRow }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select(
        "timezone, office_latitude, office_longitude, office_radius_m, max_gps_accuracy_m, session_start, session_end, valid_check_in_time",
      )
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", context.userId)
      .maybeSingle(),
  ]);

  const timezone = orgSettings?.timezone ?? "Asia/Ho_Chi_Minh";
  const workDate = todayInTimezone(timezone);

  const { data: memberRecord } = await supabase
    .from("attendance_records")
    .select("state, checked_in_at, late_minutes, check_in_method, fine_amount_snapshot, attendance_days!inner(work_date)")
    .eq("organization_id", orgId)
    .eq("user_id", context.userId)
    .eq("attendance_days.work_date", workDate)
    .maybeSingle();

  const officeConfigured =
    orgSettings?.office_latitude != null && orgSettings?.office_longitude != null;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">
          Thành viên
        </p>
        <h1 className="display-type mt-1 text-3xl">Chào {profileRow?.display_name ?? context.profile.displayName}</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Ngày làm việc {workDate} · Ca {orgSettings?.session_start?.slice(0, 5) ?? "—"}–{orgSettings?.session_end?.slice(0, 5) ?? "—"}
        </p>
      </section>

      <CheckInCard
        organizationId={orgId}
        userId={context.userId}
        timezone={timezone}
        checkedInAt={memberRecord?.checked_in_at ?? null}
        state={memberRecord?.state ?? null}
        lateMinutes={memberRecord?.late_minutes ?? 0}
        fineAmount={memberRecord?.fine_amount_snapshot ?? 0}
        method={memberRecord?.check_in_method ?? null}
        officeConfigured={officeConfigured}
        checkInWindowOpen={isWithinConfiguredTimeWindow(
          orgSettings?.session_start ?? null,
          orgSettings?.session_end ?? null,
          timezone,
        )}
        sessionStart={orgSettings?.session_start?.slice(0, 5) ?? null}
        sessionEnd={orgSettings?.session_end?.slice(0, 5) ?? null}
        validCheckInTime={orgSettings?.valid_check_in_time?.slice(0, 5) ?? "09:00"}
      />
    </div>
  );
}

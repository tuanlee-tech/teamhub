import { ModuleShell } from "@/components/module-shell";
import {
  AttendanceSettingsForm,
  BankSettingsForm,
  TtsSettingsForm,
} from "@/components/manager/settings-forms";
import { SettingsTabs } from "@/components/manager/settings-tabs";
import { SettingsTour } from "@/components/manager/settings-tour";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function shortTime(value: string) {
  return value.slice(0, 5);
}

export default async function ManagerSettingsPage() {
  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const [{ data: settings, error: settingsError }, { data: tts, error: ttsError }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("*")
      .eq("organization_id", context.membership.organizationId)
      .single(),
    supabase
      .from("tts_settings")
      .select("*")
      .eq("organization_id", context.membership.organizationId)
      .single(),
  ]);

  if (settingsError || ttsError || !settings || !tts) {
    throw new Error("Không thể tải cấu hình tổ chức.");
  }

  return (
    <ModuleShell
      description="Cấu hình mới áp dụng cho ngày làm việc được tạo sau đó. Ngày đã tạo sẽ giữ snapshot cũ."
      eyebrow=""
      title="Luật của văn phòng"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <SettingsTour />
        </div>
        <SettingsTabs
          tabs={[
          {
            id: "attendance",
            label: "Điểm danh",
            description: "Ca làm, ngày công và vị trí",
            content: (
              <div data-tour="settings-attendance-form">
              <AttendanceSettingsForm
                values={{
                  timezone: settings.timezone,
                  sessionStart: shortTime(settings.session_start),
                  sessionEnd: shortTime(settings.session_end),
                  validCheckInTime: shortTime(settings.valid_check_in_time),
                  workDays: settings.work_days,
                  officeLatitude: settings.office_latitude,
                  officeLongitude: settings.office_longitude,
                  officeRadiusM: settings.office_radius_m,
                  maxGpsAccuracyM: settings.max_gps_accuracy_m,
                }}
              />
              </div>
            ),
          },
          {
            id: "payments",
            label: "Thanh toán",
            description: "Ngân hàng và VietQR",
            content: (
              <BankSettingsForm
                values={{
                  bankCode: settings.bank_code ?? "",
                  bankShortName: settings.bank_short_name ?? "",
                  bankAccountNumber: settings.bank_account_number ?? "",
                  bankAccountHolder: settings.bank_account_holder ?? "",
                  transferDescriptionRule: settings.transfer_description_rule ?? "",
                  fundDisplayName: settings.fund_display_name ?? "",
                  vietqrTemplate: settings.vietqr_template,
                  vietqrShowInfo: settings.vietqr_show_info,
                  vietqrFullAccount: settings.vietqr_full_account,
                }}
              />
            ),
          },
          {
            id: "voice",
            label: "Âm thanh",
            description: "Giọng MC và quiet hours",
            content: (
              <TtsSettingsForm
                values={{
                  personality: tts.personality,
                  enabledEvents: tts.enabled_events,
                  cooldownSeconds: tts.cooldown_seconds,
                  quietEnabled: (tts as unknown as { quiet_enabled?: boolean }).quiet_enabled ?? false,
                  quietStart: shortTime(tts.quiet_start),
                  quietEnd: shortTime(tts.quiet_end),
                  locale: tts.locale,
                  preferredVoice: tts.preferred_voice ?? "",
                  speechRate: Number(tts.speech_rate),
                  speechPitch: Number(tts.speech_pitch),
                }}
              />
            ),
          },
          ]}
        />
      </div>
    </ModuleShell>
  );
}

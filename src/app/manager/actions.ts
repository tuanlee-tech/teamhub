"use server";

import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";

import { requireActiveMember } from "@/lib/auth";
import { SEPAY_BANK_CODES } from "@/lib/banks";
import { normalizeTransferText, validateDescriptionRule } from "@/lib/domain/payment";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ManagerActionState = {
  error?: string;
  success?: string;
};

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ.");

const attendanceSettingsSchema = z
  .object({
    timezone: z.string().trim().min(1).max(100),
    sessionStart: timeSchema,
    sessionEnd: timeSchema,
    validCheckInTime: timeSchema,
    workDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Chọn ít nhất một ngày làm việc."),
    officeLatitude: z.preprocess(
      (value) => (value === "" ? null : Number(value)),
      z.number().min(-90).max(90).nullable(),
    ),
    officeLongitude: z.preprocess(
      (value) => (value === "" ? null : Number(value)),
      z.number().min(-180).max(180).nullable(),
    ),
    officeRadiusM: z.coerce.number().int().min(10).max(5000),
    maxGpsAccuracyM: z.coerce.number().int().min(10).max(1000),
  })
  .refine(
    (data) => (data.officeLatitude === null) === (data.officeLongitude === null),
    "Vĩ độ và kinh độ phải được nhập cùng nhau.",
  );

const bankSettingsSchema = z
  .object({
    bankCode: z.union([z.enum(SEPAY_BANK_CODES), z.literal("")]),
    bankAccountNumber: z.string().trim().max(19),
    bankAccountHolder: z.string().trim().max(100),
    transferDescriptionRule: z.string().trim().max(80),
    fundDisplayName: z.string().trim().max(80),
    vietqrTemplate: z.enum(["compact", "qronly", "standee"]),
    vietqrShowInfo: z.boolean(),
    vietqrFullAccount: z.boolean(),
  })
  .superRefine((data, context) => {
    if (!data.bankCode) {
      return;
    }

    if (!/^[A-Za-z0-9]{1,19}$/.test(data.bankAccountNumber)) {
      context.addIssue({ code: "custom", message: "Số tài khoản chỉ gồm chữ và số, tối đa 19 ký tự." });
    }

    if (!data.bankAccountHolder) {
      context.addIssue({ code: "custom", message: "Nhập tên chủ tài khoản." });
    }

    const ruleResult = validateDescriptionRule(data.bankCode, data.transferDescriptionRule);
    if (!ruleResult.valid) {
      context.addIssue({
        code: "custom",
        message:
          ruleResult.reason === "vietinbank_requires_sevqr"
            ? "Nội dung VietinBank bắt buộc chứa SEVQR."
            : "Nhập quy tắc nội dung chuyển khoản.",
      });
    }
  });

const ttsSettingsSchema = z
  .object({
    personality: z.enum(["friendly", "teasing", "spicy", "extra_spicy", "relentless"]),
    enabledEvents: z
      .array(z.enum(["late", "payment", "on_time", "achievement", "fund_balance"]))
      .default([]),
    cooldownSeconds: z.coerce.number().int().min(0).max(300),
    quietEnabled: z.boolean(),
    quietStart: z.string().trim(),
    quietEnd: z.string().trim(),
    locale: z.string().trim().min(2).max(20),
    preferredVoice: z.string().trim().max(100),
    speechRate: z.coerce.number().min(0.5).max(2),
    speechPitch: z.coerce.number().min(0).max(2),
  })
  .superRefine((data, ctx) => {
    if (!data.quietEnabled) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.quietStart)) {
      ctx.addIssue({ code: "custom", message: "Giờ quiet không hợp lệ.", path: ["quietStart"] });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.quietEnd)) {
      ctx.addIssue({ code: "custom", message: "Giờ quiet không hợp lệ.", path: ["quietEnd"] });
    }
  });

const penaltyTierSchema = z.object({
  tierId: z.uuid().optional(),
  thresholdMinutes: z.coerce.number().int().min(0).max(1440),
  amountVnd: z.coerce.number().int().positive().max(1_000_000_000),
});

async function syncOpenAttendanceDays(organizationId: string) {
  const admin = createAdminClient();
  const [{ data: settings, error: settingsError }, { data: tiers, error: tierError }, { data: days, error: dayError }] = await Promise.all([
    admin
      .from("organization_settings")
      .select("timezone, session_start, session_end, valid_check_in_time")
      .eq("organization_id", organizationId)
      .single(),
    admin
      .from("penalty_tiers")
      .select("threshold_minutes, amount_vnd")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("threshold_minutes"),
    admin
      .from("attendance_days")
      .select("id, work_date")
      .eq("organization_id", organizationId)
      .eq("status", "open"),
  ]);

  if (settingsError || tierError || dayError || !settings) {
    return false;
  }

  const tierSnapshot = tiers ?? [];
  const highestThreshold = tierSnapshot.at(-1)?.threshold_minutes ?? 0;

  const results = await Promise.all(
    (days ?? []).map((day) => {
      const sessionStartAt = fromZonedTime(`${day.work_date}T${settings.session_start}`, settings.timezone);
      const sessionEndAt = fromZonedTime(`${day.work_date}T${settings.session_end}`, settings.timezone);
      const validCheckInAt = fromZonedTime(`${day.work_date}T${settings.valid_check_in_time}`, settings.timezone);
      const autoLateAt = highestThreshold > 0
        ? new Date(validCheckInAt.getTime() + (highestThreshold + 1) * 60_000)
        : sessionEndAt;

      return admin
        .from("attendance_days")
        .update({
          session_start_at: sessionStartAt.toISOString(),
          session_end_at: sessionEndAt.toISOString(),
          valid_check_in_at: validCheckInAt.toISOString(),
          auto_late_at: autoLateAt.toISOString(),
          tier_snapshot: tierSnapshot,
        })
        .eq("id", day.id);
    }),
  );

  return results.every((result) => !result.error);
}

const memberStatusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "rejected"]),
});

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Dữ liệu không hợp lệ.";
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export async function updateAttendanceSettings(
  _previousState: ManagerActionState,
  formData: FormData,
): Promise<ManagerActionState> {
  const parsed = attendanceSettingsSchema.safeParse({
    timezone: formData.get("timezone"),
    sessionStart: formData.get("sessionStart"),
    sessionEnd: formData.get("sessionEnd"),
    validCheckInTime: formData.get("validCheckInTime"),
    workDays: formData.getAll("workDays"),
    officeLatitude: formData.get("officeLatitude"),
    officeLongitude: formData.get("officeLongitude"),
    officeRadiusM: formData.get("officeRadiusM"),
    maxGpsAccuracyM: formData.get("maxGpsAccuracyM"),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  if (!isValidTimezone(parsed.data.timezone)) {
    return { error: "Múi giờ IANA không hợp lệ." };
  }

  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_settings")
    .update({
      timezone: parsed.data.timezone,
      session_start: parsed.data.sessionStart,
      session_end: parsed.data.sessionEnd,
      valid_check_in_time: parsed.data.validCheckInTime,
      work_days: parsed.data.workDays,
      office_latitude: parsed.data.officeLatitude,
      office_longitude: parsed.data.officeLongitude,
      office_radius_m: parsed.data.officeRadiusM,
      max_gps_accuracy_m: parsed.data.maxGpsAccuracyM,
      updated_by: context.userId,
    })
    .eq("organization_id", context.membership.organizationId);

  if (error) {
    return { error: "Không thể lưu cấu hình điểm danh." };
  }

  if (!(await syncOpenAttendanceDays(context.membership.organizationId))) {
    return { error: "Đã lưu cấu hình nhưng không thể đồng bộ ngày đang mở." };
  }

  revalidatePath("/manager/settings");
  revalidatePath("/manager/roster");
  return { success: "Đã lưu cấu hình điểm danh và văn phòng." };
}

export async function updateBankSettings(
  _previousState: ManagerActionState,
  formData: FormData,
): Promise<ManagerActionState> {
  const parsed = bankSettingsSchema.safeParse({
    bankCode: formData.get("bankCode"),
    bankAccountNumber: formData.get("bankAccountNumber"),
    bankAccountHolder: formData.get("bankAccountHolder"),
    transferDescriptionRule: formData.get("transferDescriptionRule"),
    fundDisplayName: formData.get("fundDisplayName"),
    vietqrTemplate: formData.get("vietqrTemplate"),
    vietqrShowInfo: formData.get("vietqrShowInfo") === "on",
    vietqrFullAccount: formData.get("vietqrFullAccount") === "on",
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const configured = Boolean(parsed.data.bankCode);
  const { error } = await supabase
    .from("organization_settings")
    .update({
      bank_code: parsed.data.bankCode || null,
      bank_account_number: configured ? parsed.data.bankAccountNumber : null,
      bank_account_holder: configured ? parsed.data.bankAccountHolder : null,
      transfer_description_rule: configured
        ? normalizeTransferText(parsed.data.transferDescriptionRule)
        : null,
      fund_display_name: parsed.data.fundDisplayName || null,
      vietqr_template: parsed.data.vietqrTemplate,
      vietqr_show_info: parsed.data.vietqrShowInfo,
      vietqr_full_account: parsed.data.vietqrFullAccount,
      updated_by: context.userId,
    })
    .eq("organization_id", context.membership.organizationId);

  if (error) {
    return { error: "Không thể lưu cấu hình ngân hàng." };
  }

  revalidatePath("/manager/settings");
  return { success: configured ? "Đã lưu cấu hình ngân hàng." : "Đã tắt cấu hình ngân hàng." };
}

export async function updateTtsSettings(
  _previousState: ManagerActionState,
  formData: FormData,
): Promise<ManagerActionState> {
  const parsed = ttsSettingsSchema.safeParse({
    personality: formData.get("personality"),
    enabledEvents: formData.getAll("enabledEvents"),
    cooldownSeconds: formData.get("cooldownSeconds"),
    quietEnabled: formData.get("quietEnabled") === "on",
    quietStart: formData.get("quietStart") ?? "00:00",
    quietEnd: formData.get("quietEnd") ?? "00:00",
    locale: formData.get("locale"),
    preferredVoice: formData.get("preferredVoice"),
    speechRate: formData.get("speechRate"),
    speechPitch: formData.get("speechPitch"),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tts_settings")
    .update({
      personality: parsed.data.personality,
      enabled_events: parsed.data.enabledEvents,
      cooldown_seconds: parsed.data.cooldownSeconds,
      quiet_enabled: parsed.data.quietEnabled,
      quiet_start: parsed.data.quietStart,
      quiet_end: parsed.data.quietEnd,
      locale: parsed.data.locale,
      preferred_voice: parsed.data.preferredVoice || null,
      speech_rate: parsed.data.speechRate,
      speech_pitch: parsed.data.speechPitch,
      updated_by: context.userId,
    })
    .eq("organization_id", context.membership.organizationId);

  if (error) {
    return { error: "Không thể lưu cấu hình giọng MC." };
  }

  revalidatePath("/manager/settings");
  return { success: "Đã lưu cấu hình giọng MC." };
}

export async function upsertPenaltyTier(
  _previousState: ManagerActionState,
  formData: FormData,
): Promise<ManagerActionState> {
  const parsed = penaltyTierSchema.safeParse({
    tierId: formData.get("tierId") || undefined,
    thresholdMinutes: formData.get("thresholdMinutes"),
    amountVnd: formData.get("amountVnd"),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const { error } = parsed.data.tierId
    ? await supabase
        .from("penalty_tiers")
        .update({
          threshold_minutes: parsed.data.thresholdMinutes,
          amount_vnd: parsed.data.amountVnd,
          is_active: true,
        })
        .eq("id", parsed.data.tierId)
        .eq("organization_id", context.membership.organizationId)
    : await supabase.from("penalty_tiers").upsert(
        {
          organization_id: context.membership.organizationId,
          threshold_minutes: parsed.data.thresholdMinutes,
          amount_vnd: parsed.data.amountVnd,
          is_active: true,
        },
        { onConflict: "organization_id,threshold_minutes" },
      );

  if (error) {
    return { error: "Không thể lưu khung phạt." };
  }

  if (!(await syncOpenAttendanceDays(context.membership.organizationId))) {
    return { error: "Đã lưu khung phạt nhưng không thể đồng bộ ngày đang mở." };
  }

  revalidatePath("/manager/penalties");
  revalidatePath("/manager/roster");
  return { success: parsed.data.tierId ? "Đã cập nhật khung phạt." : "Đã lưu khung phạt." };
}

export async function deletePenaltyTier(formData: FormData) {
  const tierId = z.uuid().safeParse(formData.get("tierId"));
  if (!tierId.success) {
    return { error: "Khung phạt không hợp lệ." };
  }

  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const { error } = await supabase
    .from("penalty_tiers")
    .delete()
    .eq("id", tierId.data)
    .eq("organization_id", context.membership.organizationId);

  if (error) {
    return { error: "Không thể xóa khung phạt." };
  }

  if (!(await syncOpenAttendanceDays(context.membership.organizationId))) {
    return { error: "Đã xóa khung phạt nhưng không thể đồng bộ ngày đang mở." };
  }

  revalidatePath("/manager/penalties");
  revalidatePath("/manager/roster");
  return { success: "Đã xóa khung phạt." };
}

export async function setAutoApprove(enabled: boolean) {
  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_settings")
    .update({
      auto_approve_members: Boolean(enabled),
      updated_by: context.userId,
    })
    .eq("organization_id", context.membership.organizationId);

  if (error) {
    return { error: "Không thể lưu cấu hình phê duyệt." };
  }

  revalidatePath("/manager/members");
  return { success: enabled ? "Đã bật duyệt tự động." : "Đã tắt duyệt tự động." };
}

export async function updateMemberStatus(formData: FormData) {
  const parsed = memberStatusSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return;
  }

  const context = await requireActiveMember("manager");
  if (parsed.data.userId === context.userId) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("organization_members")
    .update({
      status: parsed.data.status,
      is_active: parsed.data.status === "active",
      approved_at: parsed.data.status === "active" ? new Date().toISOString() : null,
      approved_by: parsed.data.status === "active" ? context.userId : null,
    })
    .eq("organization_id", context.membership.organizationId)
    .eq("user_id", parsed.data.userId);

  revalidatePath("/manager/members");
}

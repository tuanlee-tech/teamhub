"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const actionSchema = z.string().regex(/^(remove|restore):[0-9a-f-]{36}$/);
const workDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ.");

export type RosterActionState = { error?: string; success?: string };

export async function ensureRosterForDate(
  _previousState: RosterActionState,
  formData: FormData,
): Promise<RosterActionState> {
  const parsedDate = workDateSchema.safeParse(formData.get("workDate"));
  if (!parsedDate.success) {
    return { error: "Ngày điểm danh không hợp lệ." };
  }

  const context = await requireActiveMember("manager");
  const admin = createAdminClient();
  const { error } = await admin.rpc("ensure_roster_for_date", {
    organization_id: context.membership.organizationId,
    work_date: parsedDate.data,
  });

  if (error) {
    return { error: "Không thể tạo danh sách điểm danh cho ngày này." };
  }

  revalidatePath("/manager/roster");
  return { success: "Đã cập nhật danh sách thành viên." };
}

export async function updateRosterMember(
  _previousState: RosterActionState,
  formData: FormData,
): Promise<RosterActionState> {
  const actionParsed = actionSchema.safeParse(formData.get("action"));
  const workDate = formData.get("workDate") as string | null;

  if (!actionParsed.success || !workDate) {
    return { error: "Dữ liệu không hợp lệ." };
  }

  const [verb, userId] = actionParsed.data.split(":");

  const context = await requireActiveMember("manager");
  if (userId === context.userId) {
    return { error: "Không thể thay đổi danh sách điểm danh của chính mình." };
  }

  const isRequired = verb === "restore";
  const exclusionReason = verb === "remove" ? "Loại bởi manager" : null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_roster_membership", {
    organization_id: context.membership.organizationId,
    work_date: workDate,
    target_user_id: userId,
    must_attend: isRequired,
    exclusion_reason: exclusionReason,
  });

  if (error) {
    return { error: "Không thể cập nhật danh sách điểm danh." };
  }

  revalidatePath("/manager/roster");
  return { success: isRequired ? "Đã thêm lại vào danh sách điểm danh." : "Đã loại khỏi danh sách điểm danh." };
}

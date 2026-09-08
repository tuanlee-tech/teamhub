"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  success?: string;
};

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username cần ít nhất 3 ký tự.")
  .max(30, "Username tối đa 30 ký tự.")
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Username chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.");

const passwordSchema = z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự.").max(72);

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Vui lòng nhập tên hiển thị.").max(100),
  username: usernameSchema,
  email: z.email("Email không hợp lệ."),
  password: passwordSchema,
});

const onboardingSchema = z.object({
  displayName: z.string().trim().min(1, "Vui lòng nhập tên hiển thị.").max(100),
  username: usernameSchema,
});

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Thông tin không hợp lệ.";
}

export async function loginWithUsername(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const admin = createAdminClient();
  const { data: email } = await admin.rpc("resolve_login_email", {
    lookup_username: parsed.data.username,
  });

  if (!email) {
    return { error: "Username hoặc mật khẩu không đúng." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Username hoặc mật khẩu không đúng." };
  }

  redirect("/auth/continue");
}

export async function registerWithPassword(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const supabase = await createClient();
  const env = getPublicEnv();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.displayName,
        username: parsed.data.username,
      },
      emailRedirectTo: `${env.NEXT_PUBLIC_TEAMHUB_URL}/auth/continue`,
    },
  });

  if (error) {
    return { error: "Không thể tạo tài khoản. Email hoặc username có thể đã được sử dụng." };
  }

  return { success: "Đã tạo tài khoản. Hãy kiểm tra email để xác minh trước khi đăng nhập." };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const env = getPublicEnv();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.NEXT_PUBLIC_TEAMHUB_URL}/auth/callback?next=/auth/continue`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}

export async function completeOnboarding(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = onboardingSchema.safeParse({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      username: parsed.data.username,
    })
    .eq("user_id", user.id);

  if (error) {
    return { error: "Không thể lưu username. Username có thể đã được sử dụng." };
  }

  // Thử bootstrap ngay sau onboarding để user đầu tiên thành manager ngay lập tức,
  // tránh vòng redirect /auth/continue bị mất session qua ngrok.
  const { data: becameManager } = await supabase.rpc("bootstrap_first_manager");
  if (becameManager) {
    redirect("/manager");
  }

  // Nếu đã active (do bootstrap hoặc manager duyệt trước đó), điều hướng theo role
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, status, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.status === "active" && membership.is_active) {
    redirect(membership.role === "manager" ? "/manager" : "/member");
  }

  redirect("/pending");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

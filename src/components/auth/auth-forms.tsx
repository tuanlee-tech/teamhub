"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";

import {
  completeOnboarding,
  loginWithUsername,
  registerWithPassword,
  type AuthActionState,
} from "@/app/(auth)/actions";
import { useToastFeedback } from "@/components/ui";

const initialState: AuthActionState = {};

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary-action mt-3 w-full disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Đang xử lý..." : children}
    </button>
  );
}

const inputClassName =
  "mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--white)] px-4 font-normal text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)] focus:ring-3 focus:ring-[var(--signal)]/20";

export function LoginForm() {
  const [state, action] = useActionState(loginWithUsername, initialState);
  const [showPassword, setShowPassword] = useState(false);
  useToastFeedback(state);

  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block text-sm font-bold" htmlFor="username">
        Username hoặc email
        <input autoCapitalize="none" autoComplete="username" className={inputClassName} id="username" name="username" placeholder="username hoặc email" required />
      </label>
      <label className="block text-sm font-bold" htmlFor="password">
        Mật khẩu
        <span className="relative mt-2 block">
          <input
            autoComplete="current-password"
            className={`${inputClassName} !mt-0 pr-20`}
            id="password"
            name="password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-3 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--signal)] hover:bg-[var(--signal)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/40"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
          </button>
        </span>
      </label>
      <SubmitButton>Đăng nhập</SubmitButton>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerWithPassword, initialState);
  useToastFeedback(state);

  return (
    <form action={action} className="mt-8">
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold">
          Tên hiển thị
          <input autoComplete="name" className={inputClassName} name="displayName" required />
        </label>
        <label className="block text-sm font-bold">
          Username
          <input autoCapitalize="none" autoComplete="username" className={inputClassName} name="username" required />
        </label>
        <label className="block text-sm font-bold sm:col-span-2">
          Email xác minh và khôi phục
          <input autoComplete="email" className={inputClassName} name="email" required type="email" />
        </label>
        <label className="block text-sm font-bold sm:col-span-2">
          Mật khẩu
          <input autoComplete="new-password" className={inputClassName} minLength={8} name="password" required type="password" />
        </label>
      </div>
      <SubmitButton>Tạo tài khoản chờ duyệt</SubmitButton>
    </form>
  );
}

export function OnboardingForm({ defaultDisplayName }: { defaultDisplayName: string }) {
  const [state, action] = useActionState(completeOnboarding, initialState);
  useToastFeedback(state);

  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block text-sm font-bold">
        Tên hiển thị
        <input className={inputClassName} defaultValue={defaultDisplayName} name="displayName" required />
      </label>
      <label className="block text-sm font-bold">
        Username
        <input autoCapitalize="none" autoComplete="username" className={inputClassName} name="username" required />
      </label>
      <SubmitButton>Hoàn tất hồ sơ</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  completeOnboarding,
  loginWithUsername,
  registerWithPassword,
  type AuthActionState,
} from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary-action mt-3 w-full disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Đang xử lý..." : children}
    </button>
  );
}

function Feedback({ state }: { state: AuthActionState }) {
  if (!state.error && !state.success) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className={`rounded-xl px-4 py-3 text-sm font-semibold ${
        state.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"
      }`}
    >
      {state.error ?? state.success}
    </p>
  );
}

const inputClassName =
  "mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 font-normal outline-none transition focus:border-[var(--signal)] focus:ring-3 focus:ring-red-100";

export function LoginForm() {
  const [state, action] = useActionState(loginWithUsername, initialState);

  return (
    <form action={action} className="mt-8 space-y-4">
      <Feedback state={state} />
      <label className="block text-sm font-bold" htmlFor="username">
        Username
        <input autoComplete="username" className={inputClassName} id="username" name="username" required />
      </label>
      <label className="block text-sm font-bold" htmlFor="password">
        Mật khẩu
        <input autoComplete="current-password" className={inputClassName} id="password" name="password" required type="password" />
      </label>
      <SubmitButton>Đăng nhập</SubmitButton>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerWithPassword, initialState);

  return (
    <form action={action} className="mt-8">
      <Feedback state={state} />
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

  return (
    <form action={action} className="mt-8 space-y-4">
      <Feedback state={state} />
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

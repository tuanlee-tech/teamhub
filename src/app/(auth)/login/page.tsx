import Link from "next/link";
import { redirect } from "next/navigation";

import { signInWithGoogle } from "@/app/(auth)/actions";
import { LoginForm } from "@/components/auth/auth-forms";
import { SecondaryButton } from "@/components/ui";
import { getMembershipContext } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getMembershipContext();
  if (context) {
    if (!context.profile.username) {
      redirect("/onboarding");
    }
    if (context.membership?.status === "active" && context.membership.isActive) {
      redirect(context.membership.role === "manager" ? "/manager" : "/member");
    }
    redirect("/pending");
  }

  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="paper-panel w-full max-w-md p-7 sm:p-10">
        <Link className="display-type text-xl" href="/">
          TeamHub
        </Link>
        <h1 className="display-type mt-10 text-5xl">Đăng nhập</h1>
        <p className="mt-4 leading-relaxed text-[var(--ink-soft)]">
          Dùng username để đăng nhập nhanh hoặc tiếp tục bằng tài khoản Google.
        </p>
        {error ? (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            Không thể đăng nhập bằng Google. Vui lòng thử lại.
          </p>
        ) : null}
        <LoginForm />
        <div className="my-7 flex items-center gap-3 text-xs font-bold tracking-widest text-[var(--ink-soft)] uppercase">
          <span className="h-px flex-1 bg-[var(--line)]" />
          hoặc
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>
        <form action={signInWithGoogle}>
          <SecondaryButton className="w-full min-h-12" type="submit">Tiếp tục với Google</SecondaryButton>
        </form>
        <p className="mt-8 text-center text-sm text-[var(--ink-soft)]">
          Chưa có tài khoản? <Link className="font-bold text-[var(--signal)]" href="/register">Đăng ký</Link>
        </p>
      </section>
    </main>
  );
}

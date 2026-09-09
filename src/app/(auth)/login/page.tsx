import Link from "next/link";
import { redirect } from "next/navigation";

import { signInWithGoogle } from "@/app/(auth)/actions";
import { LoginForm } from "@/components/auth/auth-forms";
import { Logo, SecondaryButton } from "@/components/ui";
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
        <Link className="block w-36" href="/">
          <Logo className="h-full w-full" />
        </Link>
        <h1 className="display-type mt-10 text-5xl">Đăng nhập</h1>
        <p className="mt-4 leading-relaxed text-[var(--ink-soft)]">
          Dùng username hoặc email để đăng nhập, hoặc tiếp tục bằng tài khoản Google.
        </p>
        {error ? (
          <p className="mt-6 rounded-xl bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-300">
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
          <SecondaryButton className="min-h-12" fullWidth type="submit">
            <span className="mr-2 inline-flex">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </span>
            Tiếp tục với Google
          </SecondaryButton>
        </form>
        <p className="mt-8 text-center text-sm text-[var(--ink-soft)]">
          Chưa có tài khoản? <Link className="font-bold text-[var(--signal)]" href="/register">Đăng ký</Link>
        </p>
      </section>
    </main>
  );
}

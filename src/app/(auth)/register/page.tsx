import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/auth-forms";
import { getMembershipContext } from "@/lib/auth";

export default async function RegisterPage() {
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
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="paper-panel w-full max-w-lg p-7 sm:p-10">
        <Link className="display-type text-xl" href="/">
          TeamHub
        </Link>
        <h1 className="display-type mt-10 text-5xl">Gia nhập nhóm</h1>
        <p className="mt-4 leading-relaxed text-[var(--ink-soft)]">
          Tài khoản mới sẽ ở trạng thái chờ cho đến khi manager duyệt.
        </p>
        <RegisterForm />
        <p className="mt-7 text-center text-sm text-[var(--ink-soft)]">
          Đã có tài khoản? <Link className="font-bold text-[var(--signal)]" href="/login">Đăng nhập</Link>
        </p>
      </section>
    </main>
  );
}

import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/auth/auth-forms";
import { getMembershipContext } from "@/lib/auth";

export default async function OnboardingPage() {
  const context = await getMembershipContext();

  if (!context) {
    redirect("/login");
  }

  if (context.profile.username) {
    redirect("/auth/continue");
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="paper-panel w-full max-w-md p-7 sm:p-10">
        <span className="stamp text-[var(--signal)]">Bước cuối</span>
        <h1 className="display-type mt-8 text-5xl">Chọn username</h1>
        <p className="mt-4 leading-relaxed text-[var(--ink-soft)]">
          Username được dùng để đăng nhập nhanh và là duy nhất trong hệ thống.
        </p>
        <OnboardingForm defaultDisplayName={context.profile.displayName} />
      </section>
    </main>
  );
}

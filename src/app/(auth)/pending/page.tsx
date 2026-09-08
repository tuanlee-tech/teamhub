import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { SecondaryButton } from "@/components/ui";
import { getMembershipContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PendingPage() {
  const context = await getMembershipContext();

  if (!context) {
    redirect("/login");
  }

  if (!context.profile.username) {
    redirect("/onboarding");
  }

  if (context.membership?.status === "active" && context.membership.isActive) {
    redirect(context.membership.role === "manager" ? "/manager" : "/member");
  }

  // Tự bootstrap nếu là user đầu tiên và đang kẹt ở pending (fix flow Google onboarding → pending)
  if (context.membership?.status === "pending") {
    const supabase = await createClient();
    const { data: becameManager } = await supabase.rpc("bootstrap_first_manager");
    if (becameManager) {
      redirect("/manager");
    }
  }

  const rejected = context.membership?.status === "rejected";

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="paper-panel max-w-lg p-8 text-center sm:p-12">
        <span className="stamp text-[var(--signal)]">{rejected ? "Chưa được chấp thuận" : "Đang chờ duyệt"}</span>
        <h1 className="display-type mt-8 text-5xl">{rejected ? "Liên hệ manager" : "Manager sẽ mở cửa"}</h1>
        <p className="mt-5 leading-relaxed text-[var(--ink-soft)]">
          {rejected
            ? "Yêu cầu gia nhập chưa được chấp thuận. Manager có thể xem lại trạng thái thành viên."
            : `Xin chào ${context.profile.displayName}. Tài khoản đã xác minh nhưng chưa thể xem dữ liệu nhóm hoặc điểm danh.`}
        </p>
        <form action={signOut} className="mt-8">
          <SecondaryButton type="submit">Đăng xuất</SecondaryButton>
        </form>
      </section>
    </main>
  );
}

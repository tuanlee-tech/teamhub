import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { getMembershipContext } from "@/lib/auth";
import { SecondaryButton } from "@/components/ui";

const routes = [
  {
    href: "/member",
    index: "01",
    label: "Thành viên",
    title: "Chấm công trong một chạm",
    description: "Điểm danh GPS hoặc QR, xem khoản phạt và lịch sử cá nhân.",
  },
  {
    href: "/manager",
    index: "02",
    label: "Quản lý",
    title: "Luật rõ, quỹ minh bạch",
    description: "Thiết lập ca làm, khung phạt, ngày công, ngân hàng và giọng MC.",
  },
  {
    href: "/kiosk",
    index: "03",
    label: "Máy tính bảng",
    title: "Bảng công khai của văn phòng",
    description: "Theo dõi realtime, hiển thị QR và đọc thông báo theo hàng đợi.",
  },
] as const;

export default async function Home() {
  const context = await getMembershipContext();
  const isAuthed = !!context;
  const dashboardHref = !isAuthed
    ? "/login"
    : !context.profile.username
      ? "/onboarding"
      : context.membership?.status !== "active" || !context.membership.isActive
        ? "/pending"
        : context.membership.role === "manager"
          ? "/manager"
          : "/member";
  const dashboardLabel = !isAuthed
    ? "Đăng nhập"
    : !context.profile.username
      ? "Tiếp tục onboarding"
      : context.membership?.status !== "active" || !context.membership?.isActive
        ? "Đang chờ duyệt"
        : context.membership.role === "manager"
          ? "Mở bàn điều khiển"
          : "Mở màn hình điểm danh";

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-[var(--ink)] text-lg font-black text-[var(--paper)]">
            TH
          </span>
          <div>
            <p className="display-type text-xl leading-none">TeamHub</p>
            <p className="mt-1 text-xs font-bold tracking-[0.16em] text-[var(--ink-soft)] uppercase">
              Smart Attendance & Team Culture
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAuthed ? (
            <form action={signOut}>
              <SecondaryButton type="submit">Đăng xuất</SecondaryButton>
            </form>
          ) : null}
          <span className="stamp -rotate-2 text-[var(--signal)]">Release 01</span>
        </div>
      </header>

      <section className="grid gap-8 py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:py-20">
        <div>
          <p className="mb-4 text-sm font-black tracking-[0.2em] text-[var(--signal)] uppercase">
            Smart Attendance, Automated Fines & Team Culture
          </p>
          <h1 className="display-type max-w-5xl text-[clamp(4.2rem,11vw,10rem)] leading-[0.78]">
            Team
            <br />
            Hub
          </h1>
        </div>
        <div className="max-w-xl lg:pb-2">
          <p className="text-xl leading-relaxed font-semibold text-[var(--ink-soft)] sm:text-2xl">
            Nền tảng điểm danh Kiosk, tự động hóa phạt & quản lý quỹ đội ngũ.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link className="primary-action" href={dashboardHref}>
              {isAuthed ? dashboardLabel : "Mở màn hình điểm danh"}
            </Link>
            {isAuthed ? (
              <span className="text-sm font-semibold text-[var(--ink-soft)]">
                {context.profile.displayName} · @{context.profile.username ?? "chưa có"}
              </span>
            ) : (
              <Link className="font-bold underline decoration-[var(--signal)] decoration-2 underline-offset-4" href="/login">
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Các khu vực ứng dụng" className="grid gap-4 md:grid-cols-3">
        {routes.map((route) => (
          <Link className="route-card p-6 sm:p-8" href={route.href} key={route.href}>
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-start justify-between">
                <span className="stamp text-[var(--ink-soft)]">{route.label}</span>
                <span className="display-type text-4xl text-[var(--paper-deep)]">{route.index}</span>
              </div>
              <h2 className="display-type mt-10 max-w-xs text-3xl leading-[0.95]">{route.title}</h2>
              <p className="mt-4 max-w-sm leading-relaxed text-[var(--ink-soft)]">{route.description}</p>
            </div>
          </Link>
        ))}
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-6 text-sm font-semibold text-[var(--ink-soft)]">
        <span>TeamHub &copy; {new Date().getFullYear()}</span>
        <span>Thiết kế cho 5 đến 30 thành viên</span>
      </footer>
    </main>
  );
}

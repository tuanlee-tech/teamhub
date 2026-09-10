import Link from "next/link";

import { ModuleShell } from "@/components/module-shell";
import { ManagerTour } from "@/components/manager/manager-tour";
import { requireActiveMember } from "@/lib/auth";

const settings = [
  ["/manager/settings", "Ca làm", "Múi giờ, tọa độ, ngân hàng và giọng MC"],
  ["/manager/penalties", "Khung phạt", "Mốc phút và số tiền tương ứng"],
  ["/manager/roster", "Ngày công", "Danh sách điểm danh theo ngày, loại/khôi phục thành viên"],
  ["/manager/members", "Thành viên", "Duyệt tài khoản mới và theo dõi trạng thái"],
] as const;

export default async function ManagerPage() {
  await requireActiveMember("manager");

  return (
    <ModuleShell
      description="Mọi thay đổi luật sẽ được snapshot theo ngày làm việc để không làm sai lịch sử điểm danh và khoản phạt đã phát sinh."
      eyebrow=""
      title="Bàn điều khiển"
    >
      <div className="mb-4 flex justify-end">
        <ManagerTour />
      </div>
      <section className="grid gap-3 sm:grid-cols-2">
        {settings.map(([href, title, description], index) => (
          <Link
            className="paper-panel min-h-40 p-5 transition hover:-translate-y-1 hover:shadow-xl"
            data-tour={`manager-${href.split("/").at(-1) === "settings" ? "settings" : href.split("/").at(-1) === "members" ? "members" : href.split("/").at(-1) === "penalties" ? "penalties" : "roster"}`}
            href={href}
            key={title}
          >
            <span className="text-xs font-black text-[var(--signal)]">0{index + 1}</span>
            <h2 className="display-type mt-4 text-2xl">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{description}</p>
          </Link>
        ))}
      </section>
    </ModuleShell>
  );
}

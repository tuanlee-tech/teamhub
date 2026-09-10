import { DividedList, DividedListItem, Stamp } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT = {
  sent: "success",
  pending: "warning",
  processing: "info",
  failed: "error",
} as const;

const STATUS_LABEL: Record<string, string> = {
  sent: "Đã gửi",
  pending: "Đang chờ",
  processing: "Đang xử lý",
  failed: "Thất bại",
};

export async function NotificationList() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("notification_outbox")
    .select("id, event_type, payload, status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="paper-panel space-y-3 p-5 sm:p-6">
      <h2 className="display-type text-xl">Thông báo</h2>
      <DividedList>
        {rows.map((row) => {
          const payload = row.payload as { title?: string; body?: string } | null;
          return (
            <DividedListItem key={row.id}>
              <div className="flex w-full items-center gap-3 py-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{payload?.title ?? "Thông báo"}</p>
                  <p className="truncate text-sm text-[var(--ink-soft)]">{payload?.body ?? ""}</p>
                </div>
                <Stamp variant={STATUS_VARIANT[row.status as keyof typeof STATUS_VARIANT] ?? "muted"}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </Stamp>
              </div>
            </DividedListItem>
          );
        })}
      </DividedList>
    </section>
  );
}

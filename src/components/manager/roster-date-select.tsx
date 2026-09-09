"use client";

type RosterDay = {
  work_date: string;
  status: string;
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function RosterDateSelect({ days, selectedDate }: { days: RosterDay[]; selectedDate: string }) {
  return (
    <form action="/manager/roster" data-tour="roster-date-select" method="get">
      <label className="block text-sm font-bold tracking-[0.14em] text-[var(--ink-soft)] uppercase">
        Chọn ngày
        <select
          defaultValue={selectedDate}
          name="date"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="mt-2 h-12 w-full max-w-xs cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--white)] px-4 text-[var(--ink)]"
        >
          {days.length === 0 ? <option value={selectedDate}>Chưa có ngày làm việc</option> : null}
          {days.map((d) => (
            <option key={d.work_date} value={d.work_date}>
              {formatDate(d.work_date)} — {d.status === "open" ? "Đang mở" : d.status === "auto_late_processed" ? "Đã ghi nhận trễ" : "Đã đóng"}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

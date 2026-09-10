import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/late",
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: vi.fn() }),
}));

vi.mock("@/lib/realtime/organization-events", () => ({
  useOrganizationRealtime: vi.fn(),
}));

import {
  findLateRowByFineId,
  isFinePaidOff,
  shouldReloadLateForEvent,
  splitLateRows,
  type LateRow,
} from "./late-list";

function row(overrides: Partial<LateRow> & { fine_id?: string | null }): LateRow {
  return {
    user_id: "user-1",
    display_name: "Thanh",
    username: "thanh",
    attendance_state: "late",
    late_minutes: 5,
    checked_in_at: "2026-09-10T01:00:00Z",
    late_kind: "auto_late",
    fine_id: null,
    fine_code: null,
    fine_status: null,
    original_vnd: null,
    allocated_vnd: null,
    outstanding_vnd: null,
    ...overrides,
  };
}

describe("splitLateRows", () => {
  it("puts unpaid with outstanding > 0 in unpaid tab", () => {
    const rows = [
      row({ user_id: "u1", fine_id: "fine-1", fine_status: "unpaid", outstanding_vnd: 10000 }),
    ];
    const split = splitLateRows(rows);
    expect(split.unpaid).toHaveLength(1);
    expect(split.paid).toHaveLength(0);
  });

  it("treats zero-outstanding unpaid as paid off (contract outstanding = original - allocated)", () => {
    const rows = [
      row({ user_id: "u1", fine_id: "fine-1", fine_status: "unpaid", outstanding_vnd: 0 }),
    ];
    const split = splitLateRows(rows);
    expect(split.unpaid).toHaveLength(0);
    expect(split.paid).toHaveLength(1);
    expect(isFinePaidOff(rows[0])).toBe(true);
  });

  it("keeps pending rows without fine in unpaid tab", () => {
    const split = splitLateRows([row({ user_id: "u1", fine_id: null })]);
    expect(split.pendingFine).toHaveLength(1);
    expect(split.paid).toHaveLength(0);
  });

  it("puts paid and waived in paid tab", () => {
    const split = splitLateRows([
      row({ user_id: "u1", fine_id: "f1", fine_status: "paid", outstanding_vnd: 0 }),
      row({ user_id: "u2", fine_id: "f2", fine_status: "waived", outstanding_vnd: 5000 }),
    ]);
    expect(split.paid).toHaveLength(2);
  });
});

describe("findLateRowByFineId", () => {
  it("resolves the freshest row so modal never keeps a stale copy", () => {
    const rows = [
      row({ user_id: "u1", fine_id: "fine-1", fine_status: "unpaid", outstanding_vnd: 10000 }),
      row({ user_id: "u2", fine_id: "fine-2", fine_status: "paid", outstanding_vnd: 0 }),
    ];
    expect(findLateRowByFineId(rows, "fine-1")?.outstanding_vnd).toBe(10000);
    // After payment snapshot the same id resolves to the new state.
    const refreshed = rows.map((r) =>
      r.fine_id === "fine-1" ? { ...r, fine_status: "paid", outstanding_vnd: 0 } : r,
    );
    expect(findLateRowByFineId(refreshed, "fine-1")?.fine_status).toBe("paid");
    expect(findLateRowByFineId(refreshed, "missing")).toBeNull();
    expect(findLateRowByFineId(refreshed, null)).toBeNull();
  });
});

describe("shouldReloadLateForEvent", () => {
  const workDate = "2026-09-10";

  it("reloads check-in/attendance only for the viewed work_date, null scope reloads", () => {
    expect(
      shouldReloadLateForEvent({ kind: "check-in-status", work_date: workDate }, workDate, []),
    ).toBe(true);
    expect(
      shouldReloadLateForEvent({ kind: "check-in-status", work_date: "2026-09-09" }, workDate, []),
    ).toBe(false);
    expect(shouldReloadLateForEvent({ kind: "check-in-status", work_date: null }, workDate, [])).toBe(
      true,
    );
    expect(
      shouldReloadLateForEvent({ kind: "attendance-status", work_date: "2026-09-09" }, workDate, []),
    ).toBe(false);
  });

  it("reloads fine events for current date or known fine moving scope", () => {
    expect(
      shouldReloadLateForEvent(
        { kind: "fine-status", work_date: workDate, fine_id: "fine-1" },
        workDate,
        [],
      ),
    ).toBe(true);
    // Other date + unknown fine: skip useless reload.
    expect(
      shouldReloadLateForEvent(
        { kind: "fine-status", work_date: "2026-09-09", fine_id: "fine-x" },
        workDate,
        ["fine-1"],
      ),
    ).toBe(false);
    // Fine moved away from viewed date but was in list: still reload old scope.
    expect(
      shouldReloadLateForEvent(
        { kind: "fine-status", work_date: "2026-09-09", fine_id: "fine-1" },
        workDate,
        ["fine-1"],
      ),
    ).toBe(true);
    // Missing work_date: conservative reload.
    expect(
      shouldReloadLateForEvent({ kind: "fine-status", work_date: null, fine_id: "fine-9" }, workDate, []),
    ).toBe(true);
  });

  it("invalidates both old and new allocation scopes, including delete with null ids", () => {
    // Same-date insert/update.
    expect(
      shouldReloadLateForEvent(
        { kind: "fine-allocation-status", work_date: workDate, old_work_date: null, fine_id: "f1" },
        workDate,
        [],
      ),
    ).toBe(true);
    // Allocation moved from viewed date to another date: old scope reloads.
    expect(
      shouldReloadLateForEvent(
        {
          kind: "fine-allocation-status",
          work_date: "2026-09-09",
          old_work_date: workDate,
          fine_id: "f2",
          old_fine_id: "f1",
        },
        workDate,
        [],
      ),
    ).toBe(true);
    // Other date, unrelated fines: skip.
    expect(
      shouldReloadLateForEvent(
        {
          kind: "fine-allocation-status",
          work_date: "2026-09-09",
          old_work_date: "2026-09-09",
          fine_id: "fx",
          old_fine_id: "fy",
        },
        workDate,
        ["f1"],
      ),
    ).toBe(false);
    // Delete verified shape (allocation ids null) still invalidates via fine scope.
    expect(
      shouldReloadLateForEvent(
        {
          kind: "fine-allocation-status",
          work_date: null,
          old_work_date: null,
          fine_id: "f1",
          old_fine_id: "f1",
        },
        workDate,
        ["f1"],
      ),
    ).toBe(true);
    // Both scopes null and fine unknown: skip.
    expect(
      shouldReloadLateForEvent(
        { kind: "fine-allocation-status", work_date: null, old_work_date: null, fine_id: "fx" },
        workDate,
        ["f1"],
      ),
    ).toBe(false);
  });

  it("reloads fund events only when a related fine is on screen", () => {
    expect(
      shouldReloadLateForEvent({ kind: "fund-status", related_fine_ids: ["f1"] }, workDate, ["f1", "f2"]),
    ).toBe(true);
    expect(
      shouldReloadLateForEvent({ kind: "fund-status", related_fine_ids: ["fx"] }, workDate, ["f1"]),
    ).toBe(false);
    expect(shouldReloadLateForEvent({ kind: "fund-status", related_fine_ids: [] }, workDate, ["f1"])).toBe(
      false,
    );
    expect(
      shouldReloadLateForEvent({ kind: "fund-status", related_fine_ids: null }, workDate, ["f1"]),
    ).toBe(false);
  });
});

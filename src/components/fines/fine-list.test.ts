import { describe, expect, it } from "vitest";

import {
  isAllocationEventRelevant,
  isFineEventRelevant,
  isFundEventRelevant,
} from "./fine-list";

const ME = "user-a";
const OTHER = "user-b";

describe("fine-list realtime filtering (B04)", () => {
  it("shows new fines immediately by user match, even when the list is empty", () => {
    expect(isFineEventRelevant({ user_id: ME, fine_id: "fine-new" }, ME, new Set())).toBe(true);
    expect(isFineEventRelevant({ user_id: ME, fine_id: "fine-new" }, ME, [])).toBe(true);
    // Paid/waived của user hiện tại cũng refresh để badge/snapshot hội tụ.
    expect(isFineEventRelevant({ user_id: ME, fine_id: "fine-1" }, ME, new Set(["fine-1"]))).toBe(true);
  });

  it("ignores fines of other users", () => {
    expect(isFineEventRelevant({ user_id: OTHER, fine_id: "fine-x" }, ME, new Set())).toBe(false);
    expect(isFineEventRelevant({ user_id: OTHER, fine_id: "fine-x" }, ME, new Set(["fine-1"]))).toBe(false);
  });

  it("falls back to known fine id when user scope is missing", () => {
    const known = new Set(["fine-1"]);
    expect(isFineEventRelevant({ fine_id: "fine-1" }, ME, known)).toBe(true);
    expect(isFineEventRelevant({ fine_id: "fine-unknown" }, ME, known)).toBe(false);
  });

  it("refreshes allocation for known fines and both old/new scopes", () => {
    const known = new Set(["fine-1"]);
    // Insert/update/delete trên fine đã biết (DELETE: allocation_id null, fine_id còn).
    expect(isAllocationEventRelevant({ fine_id: "fine-1" }, ME, known)).toBe(true);
    // Allocation chuyển từ fine-1 sang fine-2: scope cũ vẫn invalidate.
    expect(isAllocationEventRelevant({ user_id: OTHER, fine_id: "fine-2", old_fine_id: "fine-1" }, ME, known)).toBe(
      true,
    );
    // Allocation của user hiện tại (fine mới chưa kịp có trong rows).
    expect(isAllocationEventRelevant({ user_id: ME, fine_id: "fine-new" }, ME, known)).toBe(true);
    // Allocation của người khác, fine không liên quan -> bỏ qua.
    expect(isAllocationEventRelevant({ user_id: OTHER, fine_id: "fine-x" }, ME, known)).toBe(false);
    expect(isAllocationEventRelevant({ fine_id: "fine-x" }, ME, known)).toBe(false);
  });

  it("refreshes fund only for related fines, never for unrelated funds", () => {
    const known = new Set(["fine-1", "fine-2"]);
    expect(isFundEventRelevant({ related_fine_ids: ["fine-2"] }, known)).toBe(true);
    expect(isFundEventRelevant({ related_fine_ids: ["fine-9"] }, known)).toBe(false);
    expect(isFundEventRelevant({ related_fine_ids: [] }, known)).toBe(false);
    expect(isFundEventRelevant({}, known)).toBe(false);
    expect(isFundEventRelevant({ related_fine_ids: ["fine-1"] }, new Set())).toBe(false);
  });

  it("supports readonly array known ids (snapshot rows)", () => {
    const known = ["fine-1"];
    expect(isFineEventRelevant({ fine_id: "fine-1" }, ME, known)).toBe(true);
    expect(isAllocationEventRelevant({ old_fine_id: "fine-1" }, OTHER, known)).toBe(true);
    expect(isFundEventRelevant({ related_fine_ids: ["fine-1"] }, known)).toBe(true);
  });
});

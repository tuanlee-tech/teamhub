import { describe, expect, it } from "vitest";

import {
  isMemberAllocationRelevant,
  isMemberAttendanceRelevant,
  isMemberCheckInRelevant,
  isMemberFineRelevant,
  isMemberFundRelevant,
} from "./check-in-card";

const ME = "user-a";
const OTHER = "user-b";

describe("member realtime filtering (B04)", () => {
  it("refreshes check-in/attendance/fine only for the current user", () => {
    expect(isMemberCheckInRelevant({ user_id: ME }, ME)).toBe(true);
    expect(isMemberCheckInRelevant({ user_id: OTHER }, ME)).toBe(false);

    expect(isMemberAttendanceRelevant({ user_id: ME } as never, ME)).toBe(true);
    expect(isMemberAttendanceRelevant({ user_id: OTHER } as never, ME)).toBe(false);

    expect(isMemberFineRelevant({ user_id: ME } as never, ME)).toBe(true);
    expect(isMemberFineRelevant({ user_id: OTHER } as never, ME)).toBe(false);
  });

  it("matches allocation by user scope (new and old) even without known fine ids", () => {
    expect(isMemberAllocationRelevant({ user_id: ME, fine_id: "fine-x" }, ME)).toBe(true);
    expect(isMemberAllocationRelevant({ user_id: OTHER, old_user_id: ME, fine_id: "fine-x" }, ME)).toBe(true);
    expect(isMemberAllocationRelevant({ user_id: OTHER, fine_id: "fine-x" }, ME)).toBe(false);
  });

  it("matches allocation by fine id when producer omits user scope", () => {
    const fineIds = ["fine-1", "fine-2"];
    expect(isMemberAllocationRelevant({ fine_id: "fine-1" }, ME, fineIds)).toBe(true);
    // DELETE verified: allocation_id null nhưng fine_id vẫn có.
    expect(isMemberAllocationRelevant({ fine_id: "fine-2", old_fine_id: null }, ME, fineIds)).toBe(true);
    // Allocation chuyển liên kết: invalidate cả scope cũ.
    expect(isMemberAllocationRelevant({ fine_id: "fine-new", old_fine_id: "fine-1" }, OTHER, fineIds)).toBe(true);
    expect(isMemberAllocationRelevant({ fine_id: "fine-other" }, OTHER, fineIds)).toBe(false);
    // Không có user scope lẫn fine quen thuộc -> không refresh (tránh refresh chéo).
    expect(isMemberAllocationRelevant({}, ME, [])).toBe(false);
  });

  it("refreshes fund only when related fines intersect member fines", () => {
    const fineIds = ["fine-1"];
    expect(isMemberFundRelevant({ related_fine_ids: ["fine-1", "fine-9"] }, fineIds)).toBe(true);
    expect(isMemberFundRelevant({ related_fine_ids: ["fine-9"] }, fineIds)).toBe(false);
    // Fund không liên quan fine nào -> không refresh mọi member (contract §7.1).
    expect(isMemberFundRelevant({ related_fine_ids: [] }, fineIds)).toBe(false);
    expect(isMemberFundRelevant({}, fineIds)).toBe(false);
    expect(isMemberFundRelevant({ related_fine_ids: ["fine-1"] }, [])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  isFineDetailAllocationRelevant,
  isFineDetailFineRelevant,
  isFineDetailFundRelevant,
} from "./fine-detail";

const FINE_ID = "fine-1";
const FINE_CODE = "MC-0001";

describe("fine detail realtime filtering (B06)", () => {
  it("refreshes on fine events matching this fine id or code", () => {
    expect(isFineDetailFineRelevant({ fine_id: FINE_ID }, FINE_ID, FINE_CODE)).toBe(true);
    expect(isFineDetailFineRelevant({ fine_id: FINE_ID, fine_code: "MC-OTHER" }, FINE_ID, FINE_CODE)).toBe(true);
    // Fallback code khi payload thiếu fine_id (flat payload theo B01 verified).
    expect(isFineDetailFineRelevant({ fine_code: FINE_CODE }, FINE_ID, FINE_CODE)).toBe(true);
  });

  it("ignores fine events for other fines", () => {
    expect(isFineDetailFineRelevant({ fine_id: "fine-2" }, FINE_ID, FINE_CODE)).toBe(false);
    expect(isFineDetailFineRelevant({ fine_code: "MC-0002" }, FINE_ID, FINE_CODE)).toBe(false);
    expect(isFineDetailFineRelevant({}, FINE_ID, FINE_CODE)).toBe(false);
  });

  it("refreshes allocation insert/update/delete on this fine", () => {
    // DELETE theo B01 verified: allocation_id null nhưng fine_id vẫn có.
    expect(isFineDetailAllocationRelevant({ fine_id: FINE_ID }, FINE_ID, FINE_CODE)).toBe(true);
    expect(
      isFineDetailAllocationRelevant({ fine_id: "fine-2", old_fine_id: FINE_ID }, FINE_ID, FINE_CODE),
    ).toBe(true);
    // Allocation chuyển từ fine đang xem sang fine khác: scope cũ vẫn invalidate.
    expect(
      isFineDetailAllocationRelevant({ fine_id: FINE_ID, old_fine_id: "fine-9" }, FINE_ID, FINE_CODE),
    ).toBe(true);
  });

  it("ignores allocations of unrelated fines", () => {
    expect(isFineDetailAllocationRelevant({ fine_id: "fine-x" }, FINE_ID, FINE_CODE)).toBe(false);
    expect(
      isFineDetailAllocationRelevant({ fine_id: "fine-x", old_fine_id: "fine-y" }, FINE_ID, FINE_CODE),
    ).toBe(false);
    expect(isFineDetailAllocationRelevant({}, FINE_ID, FINE_CODE)).toBe(false);
  });

  it("refreshes fund only when related_fine_ids contains this fine", () => {
    expect(isFineDetailFundRelevant({ related_fine_ids: [FINE_ID] }, FINE_ID)).toBe(true);
    expect(isFineDetailFundRelevant({ related_fine_ids: ["fine-9", FINE_ID] }, FINE_ID)).toBe(true);
    // Fund không liên quan fine nào -> không refresh detail (contract §7.1).
    expect(isFineDetailFundRelevant({ related_fine_ids: ["fine-9"] }, FINE_ID)).toBe(false);
    expect(isFineDetailFundRelevant({ related_fine_ids: [] }, FINE_ID)).toBe(false);
    expect(isFineDetailFundRelevant({}, FINE_ID)).toBe(false);
  });
});

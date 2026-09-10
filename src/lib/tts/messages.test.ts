import { describe, expect, it } from "vitest";

import { buildAnnouncementText } from "./messages";

describe("buildAnnouncementText", () => {
  it("đọc on_time ngắn gọn", () => {
    expect(
      buildAnnouncementText({ eventId: "e1", announcementType: "on_time", displayName: "An" }),
    ).toBe("An đã điểm danh.");
  });

  it("đọc late kèm số phút", () => {
    expect(
      buildAnnouncementText({
        eventId: "e2",
        announcementType: "late",
        displayName: "An",
        lateMinutes: 5,
      }),
    ).toBe("An đi trễ 5 phút.");
  });

  it("late thiếu minutes vẫn có câu hợp lệ", () => {
    expect(
      buildAnnouncementText({ eventId: "e3", announcementType: "late", displayName: "An" }),
    ).toBe("An đã điểm danh trễ.");
  });

  it("payment kèm mã fine", () => {
    expect(
      buildAnnouncementText({
        eventId: "e4",
        announcementType: "payment",
        displayName: "An",
        fineCode: "A7K29",
      }),
    ).toBe("Đã nhận thanh toán phạt A7K29.");
  });

  it("fallback tên khi thiếu displayName", () => {
    expect(
      buildAnnouncementText({ eventId: "e5", announcementType: "on_time", displayName: null }),
    ).toBe("Có thành viên đã điểm danh.");
  });
});

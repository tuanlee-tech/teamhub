import { describe, expect, it } from "vitest";

import { selectVoice } from "./voice";

const VOICES = [
  { name: "Google US English", lang: "en-US" },
  { name: "Google Tiếng Việt", lang: "vi-VN" },
  { name: "Linh", lang: "vi-VN" },
];

describe("selectVoice", () => {
  it("ưu tiên preferredVoice khớp name chính xác", () => {
    expect(
      selectVoice(VOICES, { preferredVoice: "Linh", locale: "en-US" })?.name,
    ).toBe("Linh");
  });

  it("fallback theo locale khi thiếu preferred", () => {
    expect(
      selectVoice(VOICES, { preferredVoice: "Không tồn tại", locale: "en-US" })?.name,
    ).toBe("Google US English");
  });

  it("fallback vi khi locale không có voice", () => {
    expect(
      selectVoice(VOICES, { preferredVoice: "", locale: "ja-JP" })?.lang,
    ).toBe("vi-VN");
  });

  it("dùng voice mặc định khi không có gì khớp", () => {
    const onlyEn = [{ name: "Alex", lang: "en-GB" }];
    expect(selectVoice(onlyEn, { preferredVoice: "", locale: "ja-JP" })?.name).toBe("Alex");
  });

  it("trả null khi không có voice nào", () => {
    expect(selectVoice([], { preferredVoice: "", locale: "vi-VN" })).toBeNull();
  });
});

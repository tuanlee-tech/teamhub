/**
 * B03 — Voice selection theo contract §5.4.
 * Ưu tiên: preferred name → lang startsWith locale → lang startsWith "vi" → voice đầu tiên.
 */

export type VoiceLike = {
  name: string;
  lang: string;
};

export function selectVoice<T extends VoiceLike>(
  voices: readonly T[],
  options: { preferredVoice: string; locale: string },
): T | null {
  if (voices.length === 0) return null;
  const preferred = options.preferredVoice.trim();
  if (preferred) {
    const exact = voices.find((v) => v.name === preferred);
    if (exact) return exact;
  }
  const locale = options.locale.trim().toLowerCase();
  if (locale) {
    const byLocale = voices.find((v) => v.lang.toLowerCase().startsWith(locale));
    if (byLocale) return byLocale;
    // "vi-VN" mà không khớp thì thử rút gọn phần language ("vi").
    const base = locale.split("-")[0];
    if (base && base !== locale) {
      const byBase = voices.find((v) => v.lang.toLowerCase().startsWith(base));
      if (byBase) return byBase;
    }
  }
  const byVi = voices.find((v) => v.lang.toLowerCase().startsWith("vi"));
  if (byVi) return byVi;
  return voices[0] ?? null;
}

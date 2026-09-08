export const TITLE_RANGES = [
  { key: "on_time_saint", min: 0, max: 0, includeMin: true },
  { key: "living_clock", min: 0, max: 5, includeMin: false },
  { key: "almost_late", min: 5, max: 10, includeMin: false },
  { key: "morning_coffee", min: 10, max: 20, includeMin: false },
  { key: "speeding_turtle", min: 20, max: 30, includeMin: false },
  { key: "morning_deadline", min: 30, max: 40, includeMin: false },
  { key: "snooze_ambassador", min: 40, max: 50, includeMin: false },
  { key: "time_is_a_concept", min: 50, max: 60, includeMin: false },
  { key: "fund_patron", min: 60, max: 75, includeMin: false },
  { key: "team_atm", min: 75, max: 90, includeMin: false },
  { key: "final_boss", min: 90, max: 100, includeMin: false },
] as const;

export type TitleKey = (typeof TITLE_RANGES)[number]["key"];

export function calculateLateRate(lateDays: number, requiredDays: number) {
  if (requiredDays <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (lateDays / requiredDays) * 100));
}

export function selectTitle(lateRate: number): TitleKey {
  const normalizedRate = Math.min(100, Math.max(0, lateRate));
  const match = TITLE_RANGES.find((range) => {
    const matchesMinimum = range.includeMin ? normalizedRate >= range.min : normalizedRate > range.min;
    return matchesMinimum && normalizedRate <= range.max;
  });

  return match?.key ?? "on_time_saint";
}

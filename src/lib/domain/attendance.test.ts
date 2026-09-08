import { describe, expect, it } from "vitest";

import {
  calculateAutoLateAt,
  calculateLateMinutes,
  selectPenaltyTier,
  validateGpsCheckIn,
} from "./attendance";

const tiers = [
  { thresholdMinutes: 10, amountVnd: 10_000 },
  { thresholdMinutes: 20, amountVnd: 20_000 },
  { thresholdMinutes: 30, amountVnd: 50_000 },
];

describe("attendance rules", () => {
  it("truncates seconds before calculating lateness", () => {
    const validAt = new Date("2026-09-07T09:35:00+07:00");

    expect(calculateLateMinutes(new Date("2026-09-07T09:35:59+07:00"), validAt)).toBe(0);
    expect(calculateLateMinutes(new Date("2026-09-07T09:36:01+07:00"), validAt)).toBe(1);
  });

  it("only applies a tier after its threshold", () => {
    expect(selectPenaltyTier(10, tiers)).toBeNull();
    expect(selectPenaltyTier(11, tiers)).toEqual(tiers[0]);
    expect(selectPenaltyTier(25, tiers)).toEqual(tiers[1]);
  });

  it("starts auto-late one minute after the highest threshold", () => {
    const validAt = new Date("2026-09-07T09:35:00+07:00");
    expect(calculateAutoLateAt(validAt, tiers)).toEqual(new Date("2026-09-07T10:06:00+07:00"));
  });

  it("rejects inaccurate or out-of-range GPS readings", () => {
    const office = { latitude: 10.7769, longitude: 106.7009 };

    expect(
      validateGpsCheckIn({
        current: office,
        office,
        accuracyM: 101,
        maxAccuracyM: 100,
        officeRadiusM: 100,
      }).reason,
    ).toBe("gps_accuracy_too_low");

    expect(
      validateGpsCheckIn({
        current: { latitude: 10.7869, longitude: 106.7009 },
        office,
        accuracyM: 20,
        maxAccuracyM: 100,
        officeRadiusM: 100,
      }).reason,
    ).toBe("outside_office_geofence");
  });

  it("returns null tier when no tiers configured", () => {
    expect(selectPenaltyTier(60, [])).toBeNull();
  });

  it("starts auto-late one minute after valid_check_in_time when no tiers", () => {
    const validAt = new Date("2026-09-07T09:35:00+07:00");
    expect(calculateAutoLateAt(validAt, [])).toEqual(new Date("2026-09-07T09:36:00+07:00"));
  });

  it("applies highest tier strictly exceeded; equals-threshold tier not applied", () => {
    expect(selectPenaltyTier(30, tiers)).toEqual(tiers[1]); // 30 > 20, but 30 !> 30
    expect(selectPenaltyTier(31, tiers)).toEqual(tiers[2]);
  });

  it("accepts GPS exactly at max accuracy and on boundary", () => {
    const office = { latitude: 10.7769, longitude: 106.7009 };

    expect(
      validateGpsCheckIn({
        current: office,
        office,
        accuracyM: 100,
        maxAccuracyM: 100,
        officeRadiusM: 100,
      }).accepted,
    ).toBe(true);

    expect(
      validateGpsCheckIn({
        current: { latitude: 10.7769, longitude: 106.7009 },
        office,
        accuracyM: 50,
        maxAccuracyM: 100,
        officeRadiusM: 100,
      }).accepted,
    ).toBe(true);
  });
});

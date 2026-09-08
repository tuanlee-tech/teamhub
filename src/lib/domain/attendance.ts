export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type PenaltyTier = {
  thresholdMinutes: number;
  amountVnd: number;
};

const EARTH_RADIUS_M = 6_371_000;
const MINUTE_MS = 60_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function truncateToMinute(value: Date) {
  return new Date(Math.floor(value.getTime() / MINUTE_MS) * MINUTE_MS);
}

export function calculateLateMinutes(checkedInAt: Date, validCheckInAt: Date) {
  const differenceMs = truncateToMinute(checkedInAt).getTime() - truncateToMinute(validCheckInAt).getTime();
  return Math.max(0, Math.floor(differenceMs / MINUTE_MS));
}

export function selectPenaltyTier(lateMinutes: number, tiers: readonly PenaltyTier[]) {
  return [...tiers]
    .filter((tier) => lateMinutes > tier.thresholdMinutes)
    .sort((left, right) => right.thresholdMinutes - left.thresholdMinutes)[0] ?? null;
}

export function calculateAutoLateAt(validCheckInAt: Date, tiers: readonly PenaltyTier[]) {
  const highestThreshold = tiers.reduce(
    (current, tier) => Math.max(current, tier.thresholdMinutes),
    0,
  );

  return new Date(truncateToMinute(validCheckInAt).getTime() + (highestThreshold + 1) * MINUTE_MS);
}

export function calculateDistanceMeters(from: Coordinates, to: Coordinates) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
}

export function validateGpsCheckIn(input: {
  current: Coordinates;
  office: Coordinates;
  accuracyM: number;
  maxAccuracyM: number;
  officeRadiusM: number;
}) {
  if (!Number.isFinite(input.accuracyM) || input.accuracyM < 0 || input.accuracyM > input.maxAccuracyM) {
    return { accepted: false as const, reason: "gps_accuracy_too_low" as const, distanceM: null };
  }

  const distanceM = calculateDistanceMeters(input.current, input.office);
  if (distanceM > input.officeRadiusM) {
    return { accepted: false as const, reason: "outside_office_geofence" as const, distanceM };
  }

  return { accepted: true as const, reason: null, distanceM };
}

import { describe, expect, it } from "vitest";

import { calculateLateRate, selectTitle } from "./titles";

describe("member titles", () => {
  it("calculates a bounded late rate", () => {
    expect(calculateLateRate(2, 10)).toBe(20);
    expect(calculateLateRate(0, 0)).toBe(0);
  });

  it("matches exact range boundaries", () => {
    expect(selectTitle(0)).toBe("on_time_saint");
    expect(selectTitle(5)).toBe("living_clock");
    expect(selectTitle(5.01)).toBe("almost_late");
    expect(selectTitle(90)).toBe("team_atm");
    expect(selectTitle(90.01)).toBe("final_boss");
  });
});

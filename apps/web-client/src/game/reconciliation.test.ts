import { describe, expect, it } from "vitest";

import { reconcileHeroPosition } from "./reconciliation";

describe("hero reconciliation", () => {
  it("ignores normal network-latency differences while moving", () => {
    expect(reconcileHeroPosition({ x: 130, y: 100 }, { x: 100, y: 100 }, true, 1 / 60)).toEqual({
      x: 130,
      y: 100
    });
  });

  it("settles gently on the authoritative position after stopping", () => {
    const corrected = reconcileHeroPosition(
      { x: 130, y: 100 },
      { x: 100, y: 100 },
      false,
      1 / 60
    );
    expect(corrected.x).toBeLessThan(130);
    expect(corrected.x).toBeGreaterThan(100);
  });

  it("repairs a large error smoothly instead of snapping", () => {
    const corrected = reconcileHeroPosition(
      { x: 500, y: 100 },
      { x: 100, y: 100 },
      true,
      1 / 60
    );
    expect(corrected.x).toBeLessThan(500);
    expect(corrected.x).toBeGreaterThan(100);
  });
});

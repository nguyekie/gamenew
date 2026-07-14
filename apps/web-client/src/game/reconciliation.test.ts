import { describe, expect, it } from "vitest";

import { reconcileHeroPosition } from "./reconciliation";

describe("hero reconciliation", () => {
  it("ignores normal network-latency differences while moving", () => {
    expect(reconcileHeroPosition({ x: 130, y: 100 }, { x: 100, y: 100 }, true)).toEqual({
      x: 130,
      y: 100
    });
  });

  it("settles gently on the authoritative position after stopping", () => {
    expect(reconcileHeroPosition({ x: 130, y: 100 }, { x: 100, y: 100 }, false)).toEqual({
      x: 121,
      y: 100
    });
  });

  it("snaps only when prediction is substantially invalid", () => {
    expect(reconcileHeroPosition({ x: 300, y: 100 }, { x: 100, y: 100 }, true)).toEqual({
      x: 100,
      y: 100
    });
  });
});


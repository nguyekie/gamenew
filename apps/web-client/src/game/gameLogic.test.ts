import { describe, expect, it } from "vitest";

import { createFormation } from "./formation";
import { findPath } from "./pathfinding";

describe("commander controls", () => {
  it("creates stable non-overlapping formation slots", () => {
    const slots = createFormation({ x: 800, y: 700 }, 50);
    expect(slots).toHaveLength(50);
    expect(new Set(slots.map((slot) => `${slot.x}:${slot.y}`)).size).toBe(50);
  });

  it("creates distinct tactical formation presets", () => {
    const line = createFormation({ x: 500, y: 500 }, 6, 38, "line");
    const wedge = createFormation({ x: 500, y: 500 }, 6, 38, "wedge");
    expect(new Set(line.map((slot) => slot.y)).size).toBe(1);
    expect(new Set(wedge.map((slot) => slot.y)).size).toBeGreaterThan(1);
  });

  it("routes units around map obstacles", () => {
    const path = findPath({ x: 430, y: 350 }, { x: 850, y: 350 });
    expect(path.length).toBeGreaterThan(10);
    expect(path.at(-1)).toEqual({ x: 850, y: 350 });
    expect(path.some((point) => point.y < 280 || point.y > 440)).toBe(true);
  });
});

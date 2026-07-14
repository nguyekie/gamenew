import { describe, expect, it } from "vitest";

import { advanceProjectile, calculateDamage, hasLineOfSight } from "./combat.js";
import { canSeePosition, computeVisionState } from "./visibility.js";

describe("authoritative combat", () => {
  it("applies armor and blocks attacks through obstacles", () => {
    expect(calculateDamage(30, 50)).toBe(20);
    expect(hasLineOfSight({ x: 450, y: 350 }, { x: 850, y: 350 })).toBe(false);
    expect(hasLineOfSight({ x: 200, y: 200 }, { x: 350, y: 200 })).toBe(true);
  });

  it("moves projectiles toward the fired point without tracking targets", () => {
    const projectile = advanceProjectile(
      {
        id: "arrow",
        ownerId: "player-one",
        position: { x: 100, y: 100 },
        velocity: { x: 200, y: 0 }
      },
      0.5
    );
    expect(projectile.position).toEqual({ x: 200, y: 100 });
  });
});

describe("server visibility", () => {
  it("hides distant entities and remembers explored cells", () => {
    const sources = [{ position: { x: 200, y: 200 }, visionRadius: 300 }];
    expect(canSeePosition(sources, { x: 1500, y: 1200 })).toBe(false);
    const explored = new Set<string>();
    const state = computeVisionState(sources, explored);
    expect(state.visibleCells.length).toBeGreaterThan(0);
    expect(state.exploredCells).toEqual(state.visibleCells);
  });

  it("reduces detection inside forests", () => {
    const sources = [{ position: { x: 120, y: 670 }, visionRadius: 350 }];
    expect(canSeePosition(sources, { x: 430, y: 670 })).toBe(false);
  });
});

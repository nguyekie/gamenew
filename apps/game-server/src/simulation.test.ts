import { describe, expect, it } from "vitest";

import type { HeroState, PlayerInputMessage } from "@aetherion/shared-types";

import { moveWithCollisions, normalizeMovement, simulateHero } from "./simulation.js";

const hero: HeroState = {
  id: "hero",
  position: { x: 100, y: 100 },
  velocity: { x: 0, y: 0 },
  rotation: 0,
  lastProcessedInput: 0,
  connected: true,
  hp: 800,
  maxHp: 800,
  armor: 30
};

const input: PlayerInputMessage = {
  type: "input",
  sequence: 1,
  movement: { x: 100, y: 100 },
  rotation: 1,
  dash: false
};

describe("authoritative hero simulation", () => {
  it("normalizes malicious oversized movement", () => {
    const movement = normalizeMovement(input.movement);
    expect(Math.hypot(movement.x, movement.y)).toBeCloseTo(1);
    expect(simulateHero(hero, input, 1, false).position.x).toBeLessThan(260);
  });

  it("blocks map boundaries and obstacles", () => {
    expect(moveWithCollisions({ x: 23, y: 23 }, { x: -100, y: -100 }, 1)).toEqual({ x: 22, y: 22 });
    const stopped = moveWithCollisions({ x: 480, y: 350 }, { x: 100, y: 0 }, 1);
    expect(stopped.x).toBe(480);
  });
});

import { describe, expect, it } from "vitest";

import type { BuildingState } from "@aetherion/shared-types";

import { BUILDING_BLUEPRINTS, calculateSupplyCap, validateBuildingPlacement } from "./economy.js";
import { counterModifier, facingModifier, moraleAfterEvent } from "./tactics.js";

const headquarters: BuildingState = {
  id: "hq",
  ownerId: "one",
  kind: "headquarters",
  position: { x: 260, y: 260 },
  width: 150,
  height: 130,
  hp: 1800,
  maxHp: 1800,
  armor: 45,
  supplyRadius: 620,
  rallyPoint: { x: 420, y: 320 },
  queue: []
};

describe("economy validation", () => {
  it("rejects overlapping and out-of-supply buildings", () => {
    expect(
      validateBuildingPlacement("barracks", { x: 260, y: 260 }, "one", [headquarters], []).valid
    ).toBe(false);
    expect(
      validateBuildingPlacement("barracks", { x: 900, y: 1450 }, "one", [headquarters], []).reason
    ).toBe("nằm ngoài phạm vi tiếp tế");
    expect(
      validateBuildingPlacement("barracks", { x: 430, y: 250 }, "one", [headquarters], []).valid
    ).toBe(true);
  });

  it("removes supply when a storehouse is destroyed", () => {
    const storehouse = { ...headquarters, id: "store", kind: "storehouse" as const, hp: 0 };
    expect(calculateSupplyCap([headquarters, storehouse], "one")).toBe(
      BUILDING_BLUEPRINTS.headquarters.supply
    );
  });
});

describe("tactical rules", () => {
  it("provides deterministic counters, flanks and morale", () => {
    expect(counterModifier("spearman", "cavalry")).toBeGreaterThan(1.5);
    expect(facingModifier({ x: -10, y: 0 }, { x: 0, y: 0 }, 0).reason).toBe("đánh sau lưng");
    expect(moraleAfterEvent(100, "ally-death")).toBe(88);
  });
});

import { describe, expect, it } from "vitest";

import type { UnitState } from "@aetherion/shared-types";

import { planBotOrders } from "./bot";

const unit: UnitState = {
  id: "bot-1",
  ownerId: "bot",
  position: { x: 100, y: 100 },
  destination: null,
  order: "stop",
  kind: "swordsman",
  hp: 100,
  maxHp: 100,
  armor: 10,
  damage: 20,
  attackRange: 40,
  visionRadius: 300,
  attackCooldownMs: 900,
  targetId: null,
  morale: 100,
  facing: 0,
  formation: "line",
  braced: false,
  panicked: false
};

describe("bot luyện tập", () => {
  it("ưu tiên kẻ địch gần trong tầm nhìn", () => {
    const [order] = planBotOrders(
      [unit],
      [
        { id: "xa", position: { x: 350, y: 100 } },
        { id: "gan", position: { x: 180, y: 100 } }
      ],
      { x: 2000, y: 1300 }
    );
    expect(order?.targetId).toBe("gan");
  });

  it("tiến về nhà chính khi chưa thấy mục tiêu", () => {
    const [order] = planBotOrders([unit], [], { x: 2000, y: 1300 });
    expect(order?.destination.x).toBeGreaterThan(1800);
  });
});

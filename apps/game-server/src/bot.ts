import type { UnitState, Vector2 } from "@aetherion/shared-types";

export interface BotOrder {
  unitId: string;
  destination: Vector2;
  targetId: string | null;
}

const distance = (left: Vector2, right: Vector2) => Math.hypot(left.x - right.x, left.y - right.y);

export const planBotOrders = (
  units: readonly UnitState[],
  enemies: readonly { id: string; position: Vector2 }[],
  enemyHeadquarters: Vector2
): BotOrder[] =>
  units.map((unit, index) => {
    const target = enemies
      .filter((enemy) => distance(unit.position, enemy.position) < unit.visionRadius * 1.35)
      .sort(
        (left, right) =>
          distance(unit.position, left.position) - distance(unit.position, right.position)
      )[0];
    const column = index % 6;
    const row = Math.floor(index / 6);
    return {
      unitId: unit.id,
      destination: target?.position ?? {
        x: enemyHeadquarters.x + (column - 2.5) * 34,
        y: enemyHeadquarters.y + (row - 2.5) * 34
      },
      targetId: target?.id ?? null
    };
  });

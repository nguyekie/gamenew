import {
  MAP_OBSTACLES,
  type MapObstacle,
  type ProjectileState,
  type Vector2
} from "@aetherion/shared-types";

export const distanceBetween = (left: Vector2, right: Vector2) =>
  Math.hypot(right.x - left.x, right.y - left.y);

export const calculateDamage = (damage: number, armor: number) =>
  Math.max(1, Math.round(damage * (100 / (100 + Math.max(0, armor)))));

const segmentIntersectsRectangle = (start: Vector2, end: Vector2, rectangle: MapObstacle) => {
  const direction = { x: end.x - start.x, y: end.y - start.y };
  let minimum = 0;
  let maximum = 1;
  for (const [origin, delta, low, high] of [
    [start.x, direction.x, rectangle.x, rectangle.x + rectangle.width],
    [start.y, direction.y, rectangle.y, rectangle.y + rectangle.height]
  ] as const) {
    if (Math.abs(delta) < 0.0001) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const first = (low - origin) / delta;
    const second = (high - origin) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return true;
};

export const hasLineOfSight = (
  start: Vector2,
  end: Vector2,
  obstacles: readonly MapObstacle[] = MAP_OBSTACLES
) => !obstacles.some((obstacle) => segmentIntersectsRectangle(start, end, obstacle));

export const advanceProjectile = (projectile: ProjectileState, deltaSeconds: number) => ({
  ...projectile,
  position: {
    x: projectile.position.x + projectile.velocity.x * deltaSeconds,
    y: projectile.position.y + projectile.velocity.y * deltaSeconds
  }
});

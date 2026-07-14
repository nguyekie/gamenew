import type { Vector2 } from "@aetherion/shared-types";

export const reconcileHeroPosition = (
  predicted: Vector2,
  authoritative: Vector2,
  moving: boolean
): Vector2 => {
  const distance = Math.hypot(
    authoritative.x - predicted.x,
    authoritative.y - predicted.y
  );

  if (distance > 140) return { ...authoritative };
  if (moving && distance < 70) return { ...predicted };

  const correction = moving ? 0.08 : 0.3;
  return {
    x: predicted.x + (authoritative.x - predicted.x) * correction,
    y: predicted.y + (authoritative.y - predicted.y) * correction
  };
};


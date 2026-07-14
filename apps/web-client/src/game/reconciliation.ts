import type { Vector2 } from "@aetherion/shared-types";

export const reconcileHeroPosition = (
  predicted: Vector2,
  authoritative: Vector2,
  moving: boolean,
  deltaSeconds: number
): Vector2 => {
  const distance = Math.hypot(
    authoritative.x - predicted.x,
    authoritative.y - predicted.y
  );

  if (moving && distance < 260) return { ...predicted };

  const correctionSpeed = distance > 260 ? 12 : 7;
  const correction = 1 - Math.exp(-correctionSpeed * Math.max(0, deltaSeconds));
  return {
    x: predicted.x + (authoritative.x - predicted.x) * correction,
    y: predicted.y + (authoritative.y - predicted.y) * correction
  };
};

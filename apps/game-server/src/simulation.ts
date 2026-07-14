import {
  HERO_DASH_SPEED,
  HERO_SPEED,
  MAP_OBSTACLES,
  MAP_SIZE,
  type HeroState,
  type MapObstacle,
  type PlayerInputMessage,
  type Vector2
} from "@aetherion/shared-types";

const HERO_RADIUS = 22;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const overlaps = (position: Vector2, obstacle: MapObstacle, radius = HERO_RADIUS) =>
  position.x + radius > obstacle.x &&
  position.x - radius < obstacle.x + obstacle.width &&
  position.y + radius > obstacle.y &&
  position.y - radius < obstacle.y + obstacle.height;

export const normalizeMovement = (movement: Vector2): Vector2 => {
  const length = Math.hypot(movement.x, movement.y);
  if (length <= 1) return movement;
  return { x: movement.x / length, y: movement.y / length };
};

export const moveWithCollisions = (
  position: Vector2,
  velocity: Vector2,
  deltaSeconds: number,
  obstacles: readonly MapObstacle[] = MAP_OBSTACLES
): Vector2 => {
  const nextX = {
    x: clamp(position.x + velocity.x * deltaSeconds, HERO_RADIUS, MAP_SIZE.width - HERO_RADIUS),
    y: position.y
  };
  const resolvedX = obstacles.some((obstacle) => overlaps(nextX, obstacle)) ? position.x : nextX.x;
  const nextY = {
    x: resolvedX,
    y: clamp(position.y + velocity.y * deltaSeconds, HERO_RADIUS, MAP_SIZE.height - HERO_RADIUS)
  };
  const resolvedY = obstacles.some((obstacle) => overlaps(nextY, obstacle)) ? position.y : nextY.y;
  return { x: resolvedX, y: resolvedY };
};

export const simulateHero = (
  hero: HeroState,
  input: PlayerInputMessage,
  deltaSeconds: number,
  dashAllowed: boolean
): HeroState => {
  const movement = normalizeMovement(input.movement);
  const speed = input.dash && dashAllowed ? HERO_DASH_SPEED : HERO_SPEED;
  const velocity = { x: movement.x * speed, y: movement.y * speed };
  return {
    ...hero,
    position: moveWithCollisions(hero.position, velocity, deltaSeconds),
    velocity,
    rotation: Number.isFinite(input.rotation) ? input.rotation : hero.rotation,
    lastProcessedInput: input.sequence
  };
};

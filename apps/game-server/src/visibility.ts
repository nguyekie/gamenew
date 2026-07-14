import {
  MAP_SIZE,
  TERRAIN_ZONES,
  type TerrainZone,
  type Vector2,
  type VisionState
} from "@aetherion/shared-types";

export const VISION_CELL_SIZE = 80;

export interface VisionSource {
  position: Vector2;
  visionRadius: number;
}

export interface RevealZone {
  position: Vector2;
  radius: number;
  expiresAt: number;
}

const contains = (zone: TerrainZone, position: Vector2) =>
  position.x >= zone.x &&
  position.x <= zone.x + zone.width &&
  position.y >= zone.y &&
  position.y <= zone.y + zone.height;

export const terrainAt = (position: Vector2, kind: TerrainZone["kind"]) =>
  TERRAIN_ZONES.some((zone) => zone.kind === kind && contains(zone, position));

export const canSeePosition = (
  sources: readonly VisionSource[],
  target: Vector2,
  reveals: readonly RevealZone[] = []
) => {
  if (
    reveals.some(
      (reveal) =>
        Math.hypot(target.x - reveal.position.x, target.y - reveal.position.y) <= reveal.radius
    )
  )
    return true;
  const forestModifier = terrainAt(target, "forest") ? 0.58 : 1;
  return sources.some((source) => {
    const hillModifier = terrainAt(source.position, "hill") ? 1.35 : 1;
    return (
      Math.hypot(target.x - source.position.x, target.y - source.position.y) <=
      source.visionRadius * hillModifier * forestModifier
    );
  });
};

export const computeVisionState = (
  sources: readonly VisionSource[],
  explored: Set<string>,
  reveals: readonly RevealZone[] = []
): VisionState => {
  const visibleCells: string[] = [];
  const columns = Math.ceil(MAP_SIZE.width / VISION_CELL_SIZE);
  const rows = Math.ceil(MAP_SIZE.height / VISION_CELL_SIZE);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const cell = `${x},${y}`;
      const position = {
        x: x * VISION_CELL_SIZE + VISION_CELL_SIZE / 2,
        y: y * VISION_CELL_SIZE + VISION_CELL_SIZE / 2
      };
      if (!canSeePosition(sources, position, reveals)) continue;
      visibleCells.push(cell);
      explored.add(cell);
    }
  }
  return { cellSize: VISION_CELL_SIZE, visibleCells, exploredCells: [...explored] };
};

import { MAP_OBSTACLES, MAP_SIZE, type Vector2 } from "@aetherion/shared-types";

const CELL_SIZE = 40;
const columns = Math.ceil(MAP_SIZE.width / CELL_SIZE);
const rows = Math.ceil(MAP_SIZE.height / CELL_SIZE);
const key = (x: number, y: number) => `${x},${y}`;

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
}

const isBlocked = (x: number, y: number) => {
  const worldX = x * CELL_SIZE + CELL_SIZE / 2;
  const worldY = y * CELL_SIZE + CELL_SIZE / 2;
  return MAP_OBSTACLES.some(
    (obstacle) =>
      worldX > obstacle.x - 14 &&
      worldX < obstacle.x + obstacle.width + 14 &&
      worldY > obstacle.y - 14 &&
      worldY < obstacle.y + obstacle.height + 14
  );
};

const toCell = (point: Vector2) => ({
  x: Math.max(0, Math.min(columns - 1, Math.floor(point.x / CELL_SIZE))),
  y: Math.max(0, Math.min(rows - 1, Math.floor(point.y / CELL_SIZE)))
});

export const findPath = (start: Vector2, destination: Vector2): Vector2[] => {
  const source = toCell(start);
  const target = toCell(destination);
  if (isBlocked(target.x, target.y)) return [];
  const open: Node[] = [{ ...source, g: 0, f: 0 }];
  const costs = new Map<string, number>([[key(source.x, source.y), 0]]);
  const parents = new Map<string, string>();

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    if (!current) break;
    if (current.x === target.x && current.y === target.y) {
      const cells: Array<{ x: number; y: number }> = [target];
      let cursor = key(target.x, target.y);
      while (parents.has(cursor)) {
        const parent = parents.get(cursor);
        if (!parent) break;
        const coordinates = parent.split(",").map(Number);
        cells.push({ x: coordinates[0] ?? 0, y: coordinates[1] ?? 0 });
        cursor = parent;
      }
      return cells
        .reverse()
        .slice(1)
        .map((cell, index, array) =>
          index === array.length - 1
            ? destination
            : { x: cell.x * CELL_SIZE + CELL_SIZE / 2, y: cell.y * CELL_SIZE + CELL_SIZE / 2 }
        );
    }

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows || isBlocked(x, y)) continue;
      const nextCost = current.g + 1;
      const nextKey = key(x, y);
      if (nextCost >= (costs.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(nextKey, nextCost);
      parents.set(nextKey, key(current.x, current.y));
      open.push({
        x,
        y,
        g: nextCost,
        f: nextCost + Math.abs(target.x - x) + Math.abs(target.y - y)
      });
    }
  }
  return [];
};

import { MAP_OBSTACLES, MAP_SIZE, type Vector2 } from "@aetherion/shared-types";

const CELL_SIZE = 40;
const columns = Math.ceil(MAP_SIZE.width / CELL_SIZE);
const rows = Math.ceil(MAP_SIZE.height / CELL_SIZE);
const key = (x: number, y: number) => `${x},${y}`;

const blocked = (x: number, y: number) => {
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

export const findServerPath = (start: Vector2, destination: Vector2): Vector2[] => {
  const source = toCell(start);
  const target = toCell(destination);
  if (blocked(target.x, target.y)) return [];
  const open = [{ ...source, cost: 0, score: 0 }];
  const costs = new Map<string, number>([[key(source.x, source.y), 0]]);
  const parents = new Map<string, string>();

  while (open.length > 0) {
    open.sort((left, right) => left.score - right.score);
    const current = open.shift();
    if (!current) break;
    if (current.x === target.x && current.y === target.y) {
      const cells = [target];
      let cursor = key(target.x, target.y);
      while (parents.has(cursor)) {
        const parent = parents.get(cursor);
        if (!parent) break;
        const values = parent.split(",").map(Number);
        cells.push({ x: values[0] ?? 0, y: values[1] ?? 0 });
        cursor = parent;
      }
      return cells
        .reverse()
        .slice(1)
        .map((cell, index, path) =>
          index === path.length - 1
            ? destination
            : { x: cell.x * CELL_SIZE + CELL_SIZE / 2, y: cell.y * CELL_SIZE + CELL_SIZE / 2 }
        );
    }
    for (const [offsetX, offsetY] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const x = current.x + offsetX;
      const y = current.y + offsetY;
      if (x < 0 || y < 0 || x >= columns || y >= rows || blocked(x, y)) continue;
      const cost = current.cost + 1;
      const cellKey = key(x, y);
      if (cost >= (costs.get(cellKey) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(cellKey, cost);
      parents.set(cellKey, key(current.x, current.y));
      open.push({
        x,
        y,
        cost,
        score: cost + Math.abs(target.x - x) + Math.abs(target.y - y)
      });
    }
  }
  return [];
};

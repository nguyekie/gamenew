import type { FormationPreset, Vector2 } from "@aetherion/shared-types";

export const createFormation = (
  center: Vector2,
  count: number,
  spacing = 38,
  preset: FormationPreset = "box"
): Vector2[] => {
  if (count <= 0) return [];
  if (preset === "line")
    return Array.from({ length: count }, (_, index) => ({
      x: center.x + (index - (count - 1) / 2) * spacing,
      y: center.y
    }));
  if (preset === "wedge")
    return Array.from({ length: count }, (_, index) => {
      const rank = Math.floor(Math.sqrt(index));
      const rankStart = rank * rank;
      const position = index - rankStart;
      return {
        x: center.x + (position - rank) * spacing,
        y: center.y + rank * spacing * 0.78
      };
    });
  const resolvedSpacing = preset === "spread" ? spacing * 1.55 : spacing;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    return {
      x: center.x + (column - (rowCount - 1) / 2) * resolvedSpacing,
      y: center.y + (row - (rows - 1) / 2) * resolvedSpacing
    };
  });
};

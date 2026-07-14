import {
  MAP_OBSTACLES,
  MAP_SIZE,
  type BuildingKind,
  type BuildingState,
  type PlayerResources,
  type ResourceNodeState,
  type UnitKind,
  type UnitState,
  type Vector2
} from "@aetherion/shared-types";

interface BuildingBlueprint {
  cost: PlayerResources;
  width: number;
  height: number;
  hp: number;
  armor: number;
  supplyRadius: number;
  supply: number;
}

export const BUILDING_BLUEPRINTS: Record<BuildingKind, BuildingBlueprint> = {
  headquarters: {
    cost: { gold: 600, wood: 500, food: 0 },
    width: 150,
    height: 130,
    hp: 1800,
    armor: 45,
    supplyRadius: 620,
    supply: 50
  },
  barracks: {
    cost: { gold: 180, wood: 260, food: 0 },
    width: 112,
    height: 94,
    hp: 900,
    armor: 30,
    supplyRadius: 0,
    supply: 0
  },
  "archery-range": {
    cost: { gold: 220, wood: 240, food: 0 },
    width: 112,
    height: 94,
    hp: 820,
    armor: 24,
    supplyRadius: 0,
    supply: 0
  },
  storehouse: {
    cost: { gold: 80, wood: 190, food: 0 },
    width: 86,
    height: 78,
    hp: 620,
    armor: 20,
    supplyRadius: 390,
    supply: 16
  },
  watchtower: {
    cost: { gold: 140, wood: 170, food: 0 },
    width: 64,
    height: 64,
    hp: 700,
    armor: 34,
    supplyRadius: 0,
    supply: 0
  }
};

export const canAfford = (resources: PlayerResources, cost: PlayerResources) =>
  resources.gold >= cost.gold && resources.wood >= cost.wood && resources.food >= cost.food;

export const deductResources = (
  resources: PlayerResources,
  cost: PlayerResources
): PlayerResources => ({
  gold: resources.gold - cost.gold,
  wood: resources.wood - cost.wood,
  food: resources.food - cost.food
});

const rectanglesOverlap = (
  left: { position: Vector2; width: number; height: number },
  right: { position: Vector2; width: number; height: number }
) =>
  Math.abs(left.position.x - right.position.x) < (left.width + right.width) / 2 + 12 &&
  Math.abs(left.position.y - right.position.y) < (left.height + right.height) / 2 + 12;

export const validateBuildingPlacement = (
  kind: BuildingKind,
  position: Vector2,
  ownerId: string,
  buildings: readonly BuildingState[],
  resourceNodes: readonly ResourceNodeState[]
) => {
  const blueprint = BUILDING_BLUEPRINTS[kind];
  const candidate = { position, width: blueprint.width, height: blueprint.height };
  if (
    position.x - blueprint.width / 2 < 0 ||
    position.y - blueprint.height / 2 < 0 ||
    position.x + blueprint.width / 2 > MAP_SIZE.width ||
    position.y + blueprint.height / 2 > MAP_SIZE.height
  )
    return { valid: false, reason: "nằm ngoài bản đồ" } as const;
  if (
    MAP_OBSTACLES.some((obstacle) =>
      rectanglesOverlap(candidate, {
        position: { x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height / 2 },
        width: obstacle.width,
        height: obstacle.height
      })
    )
  )
    return { valid: false, reason: "chồng lên địa hình cản trở" } as const;
  if (buildings.some((building) => rectanglesOverlap(candidate, building)))
    return { valid: false, reason: "chồng lên công trình khác" } as const;
  if (
    resourceNodes.some(
      (node) => Math.hypot(node.position.x - position.x, node.position.y - position.y) < 95
    )
  )
    return { valid: false, reason: "che khuất điểm tài nguyên" } as const;
  const supplyBuildings = buildings.filter(
    (building) =>
      building.ownerId === ownerId &&
      (building.kind === "headquarters" || building.kind === "storehouse")
  );
  if (
    kind !== "headquarters" &&
    !supplyBuildings.some(
      (building) =>
        Math.hypot(building.position.x - position.x, building.position.y - position.y) <=
        building.supplyRadius
    )
  )
    return { valid: false, reason: "nằm ngoài phạm vi tiếp tế" } as const;
  return { valid: true, reason: "hợp lệ" } as const;
};

export const calculateSupplyCap = (buildings: readonly BuildingState[], ownerId: string) =>
  buildings
    .filter((building) => building.ownerId === ownerId && building.hp > 0)
    .reduce((total, building) => total + BUILDING_BLUEPRINTS[building.kind].supply, 0);

export const calculateGatherRates = (
  units: readonly UnitState[],
  nodes: readonly ResourceNodeState[]
): PlayerResources => {
  const rates = { gold: 0, wood: 0, food: 0 };
  for (const node of nodes) {
    if (node.remaining <= 0) continue;
    const workers = units.filter(
      (unit) =>
        Math.hypot(unit.position.x - node.position.x, unit.position.y - node.position.y) <= 165
    ).length;
    rates[node.kind] += Math.min(3, workers) * (node.kind === "food" ? 3 : 2);
  }
  return rates;
};

export const producerAccepts = (building: BuildingKind, unit: UnitKind) => {
  if (building === "barracks")
    return ["swordsman", "spearman", "cavalry", "guardian"].includes(unit);
  if (building === "archery-range") return ["archer", "skirmisher"].includes(unit);
  return false;
};

export type ServiceName = "api-server" | "game-server";

export interface HealthResponse {
  service: ServiceName;
  status: "ok";
  version: string;
  timestamp: string;
}

export interface PlayerResources {
  gold: number;
  food: number;
  wood: number;
}

export type ResourceKind = keyof PlayerResources;

export interface Vector2 {
  x: number;
  y: number;
}

export const GAME_TICK_RATE = 20;
export const HERO_SPEED = 220;
export const HERO_DASH_SPEED = 520;
export const MAP_SIZE = { width: 2400, height: 1600 } as const;
export const BASE_POSITIONS = [
  { x: 260, y: 260 },
  { x: 2140, y: 1340 }
] as const;

export interface MapObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAP_OBSTACLES: readonly MapObstacle[] = [
  { x: 0, y: 690, width: 1040, height: 180 },
  { x: 1360, y: 690, width: 1040, height: 180 },
  { x: 520, y: 300, width: 260, height: 120 },
  { x: 1040, y: 190, width: 150, height: 360 },
  { x: 1510, y: 330, width: 330, height: 130 },
  { x: 360, y: 850, width: 170, height: 360 },
  { x: 890, y: 780, width: 410, height: 150 },
  { x: 1650, y: 800, width: 160, height: 390 },
  { x: 1120, y: 1210, width: 430, height: 120 }
] as const;

export interface TerrainZone extends MapObstacle {
  id: string;
  kind: "forest" | "hill";
}

export const TERRAIN_ZONES: readonly TerrainZone[] = [
  { id: "forest-west", kind: "forest", x: 120, y: 560, width: 420, height: 220 },
  { id: "forest-east", kind: "forest", x: 1830, y: 610, width: 430, height: 250 },
  { id: "forest-south", kind: "forest", x: 650, y: 1210, width: 340, height: 230 },
  { id: "hill-north", kind: "hill", x: 790, y: 80, width: 330, height: 220 },
  { id: "hill-center", kind: "hill", x: 1320, y: 610, width: 300, height: 230 }
] as const;

export interface HeroState {
  id: string;
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  lastProcessedInput: number;
  connected: boolean;
  hp: number;
  maxHp: number;
  armor: number;
}

export type UnitOrder = "move" | "hold" | "stop" | "retreat" | "attack";
export type UnitKind = "swordsman" | "spearman" | "archer" | "cavalry" | "skirmisher" | "guardian";
export type FormationPreset = "line" | "wedge" | "box" | "spread";

export interface UnitState {
  id: string;
  ownerId: string;
  position: Vector2;
  destination: Vector2 | null;
  order: UnitOrder;
  kind: UnitKind;
  hp: number;
  maxHp: number;
  armor: number;
  damage: number;
  attackRange: number;
  visionRadius: number;
  attackCooldownMs: number;
  targetId: string | null;
  morale: number;
  facing: number;
  formation: FormationPreset;
  braced: boolean;
  panicked: boolean;
}

export type BuildingKind =
  "headquarters" | "barracks" | "archery-range" | "storehouse" | "watchtower";

export interface ProductionQueueItem {
  id: string;
  unitKind: UnitKind;
  completesAt: number;
}

export interface BuildingState {
  id: string;
  ownerId: string;
  kind: BuildingKind;
  position: Vector2;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  armor: number;
  supplyRadius: number;
  rallyPoint: Vector2;
  queue: ProductionQueueItem[];
}

export interface ResourceNodeState {
  id: string;
  kind: ResourceKind;
  position: Vector2;
  remaining: number;
}

export const RESOURCE_NODES: readonly Omit<ResourceNodeState, "remaining">[] = [
  { id: "gold-west", kind: "gold", position: { x: 560, y: 210 } },
  { id: "wood-west", kind: "wood", position: { x: 320, y: 680 } },
  { id: "food-west", kind: "food", position: { x: 710, y: 620 } },
  { id: "gold-center", kind: "gold", position: { x: 1200, y: 740 } },
  { id: "food-center", kind: "food", position: { x: 1200, y: 1020 } },
  { id: "gold-east", kind: "gold", position: { x: 1840, y: 1390 } },
  { id: "wood-east", kind: "wood", position: { x: 2080, y: 920 } },
  { id: "food-east", kind: "food", position: { x: 1690, y: 980 } }
] as const;

export interface EconomyState {
  resources: PlayerResources;
  supplyUsed: number;
  supplyCap: number;
  gatherRates: PlayerResources;
}

export interface MatchStats {
  resourcesGathered: PlayerResources;
  unitsProduced: number;
  unitsLost: number;
  buildingsBuilt: number;
  buildingsDestroyed: number;
  damageDealt: number;
}

export type MatchPhase = "waiting" | "countdown" | "active" | "paused" | "finished";

export interface MatchState {
  phase: MatchPhase;
  countdownEndsAt: number | null;
  startedAt: number | null;
  elapsedMs: number;
  pauseReason: string | null;
  targetDurationMs: number;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
}

export interface CombatLogEntry {
  id: string;
  tick: number;
  text: string;
  kind: "hit" | "death" | "skill" | "victory" | "economy" | "morale" | "match";
}

export interface VisionState {
  cellSize: number;
  visibleCells: string[];
  exploredCells: string[];
}

export interface GameSnapshot {
  type: "snapshot";
  roomCode: string;
  serverTime: number;
  tick: number;
  heroes: HeroState[];
  units: UnitState[];
  buildings: BuildingState[];
  resourceNodes: ResourceNodeState[];
  projectiles: ProjectileState[];
  combatLog: CombatLogEntry[];
  vision: VisionState;
  winnerId: string | null;
  roomPlayerCount: number;
  economy: EconomyState;
  stats: MatchStats;
  match: MatchState;
}

export interface JoinRoomMessage {
  type: "join";
  roomCode: string;
  reconnectToken?: string;
}

export interface PlayerInputMessage {
  type: "input";
  sequence: number;
  movement: Vector2;
  rotation: number;
  dash: boolean;
}

export interface UnitCommandMessage {
  type: "unit-command";
  unitIds: string[];
  order: UnitOrder;
  destinations?: Vector2[];
  targetId?: string;
}

export interface AttackCommandMessage {
  type: "attack";
  attackerIds: string[];
  targetId: string;
}

export type HeroAbility = "basic" | "shockwave" | "piercing-shot" | "scout";

export interface HeroAbilityMessage {
  type: "hero-ability";
  ability: HeroAbility;
  target: Vector2;
  targetId?: string;
}

export interface PlaceBuildingMessage {
  type: "place-building";
  buildingKind: BuildingKind;
  position: Vector2;
}

export interface QueueProductionMessage {
  type: "queue-production";
  buildingId: string;
  unitKind: UnitKind;
}

export interface SetRallyPointMessage {
  type: "set-rally";
  buildingId: string;
  position: Vector2;
}

export interface SetFormationMessage {
  type: "set-formation";
  unitIds: string[];
  formation: FormationPreset;
}

export interface SurrenderMessage {
  type: "surrender";
}

export type ClientGameMessage =
  | JoinRoomMessage
  | PlayerInputMessage
  | UnitCommandMessage
  | AttackCommandMessage
  | HeroAbilityMessage
  | PlaceBuildingMessage
  | QueueProductionMessage
  | SetRallyPointMessage
  | SetFormationMessage
  | SurrenderMessage;

export interface JoinedRoomMessage {
  type: "joined";
  roomCode: string;
  playerId: string;
  reconnectToken: string;
  reconnected: boolean;
}

export interface GameErrorMessage {
  type: "error";
  message: string;
}

export type ServerGameMessage = JoinedRoomMessage | GameSnapshot | GameErrorMessage;

export const createHealthResponse = (service: ServiceName, version: string): HealthResponse => ({
  service,
  status: "ok",
  version,
  timestamp: new Date().toISOString()
});

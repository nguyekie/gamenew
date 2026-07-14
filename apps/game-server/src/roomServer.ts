import { randomBytes, randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import {
  BASE_POSITIONS,
  GAME_TICK_RATE,
  HERO_DASH_DURATION_MS,
  MAP_SIZE,
  RESOURCE_NODES,
  type AttackCommandMessage,
  type BuildingState,
  type ClientGameMessage,
  type CombatLogEntry,
  type GameSnapshot,
  type HeroAbility,
  type HeroAbilityMessage,
  type HeroState,
  type MatchPhase,
  type MatchStats,
  type PlayerInputMessage,
  type PlayerResources,
  type ProjectileState,
  type ServerGameMessage,
  type UnitCommandMessage,
  type UnitKind,
  type UnitState,
  type Vector2
} from "@aetherion/shared-types";
import { WebSocket, WebSocketServer } from "ws";

import { planBotOrders } from "./bot.js";
import { advanceProjectile, calculateDamage, distanceBetween, hasLineOfSight } from "./combat.js";
import {
  BUILDING_BLUEPRINTS,
  calculateGatherRates,
  calculateSupplyCap,
  canAfford,
  deductResources,
  producerAccepts,
  validateBuildingPlacement
} from "./economy.js";
import { MatchStore } from "./matchStore.js";
import { findServerPath } from "./pathfinding.js";
import { simulateHero } from "./simulation.js";
import {
  canSeePosition,
  computeVisionState,
  terrainAt,
  type RevealZone,
  type VisionSource
} from "./visibility.js";
import {
  UNIT_BLUEPRINTS,
  counterModifier,
  facingModifier,
  formationDamageModifier,
  formationDefenseModifier,
  moraleAfterEvent
} from "./tactics.js";

const RECONNECT_WINDOW_MS = 30_000;
const DASH_COOLDOWN_MS = 850;
const HERO_VISION = 460;

const UNIT_NAMES: Record<UnitKind, string> = {
  swordsman: "kiếm sĩ",
  spearman: "lính giáo",
  archer: "cung thủ",
  cavalry: "kỵ binh",
  skirmisher: "quân quấy rối",
  guardian: "hộ vệ"
};

const BUILDING_NAMES: Record<BuildingState["kind"], string> = {
  headquarters: "nhà chính",
  barracks: "doanh trại",
  "archery-range": "trường bắn",
  storehouse: "kho lương",
  watchtower: "tháp canh"
};

interface ServerProjectile extends ProjectileState {
  damage: number;
  expiresAt: number;
  label: string;
  unitKind: UnitKind | null;
  formation: UnitState["formation"] | null;
}

interface PlayerSession {
  id: string;
  token: string;
  socket: WebSocket | null;
  hero: HeroState;
  units: UnitState[];
  unitPaths: Map<string, Vector2[]>;
  input: PlayerInputMessage;
  lastDashAt: number;
  dashUntil: number;
  attacksAt: Map<string, number>;
  abilityReadyAt: Map<HeroAbility, number>;
  disconnectedAt: number | null;
  explored: Set<string>;
  reveals: RevealZone[];
  resources: PlayerResources;
  gatherRates: PlayerResources;
  stats: MatchStats;
  chargeDistance: Map<string, number>;
  lastEconomyAt: number;
  lastMoraleAt: number;
  isBot: boolean;
  lastBotThinkAt: number;
}

interface Room {
  code: string;
  tick: number;
  players: Map<string, PlayerSession>;
  projectiles: ServerProjectile[];
  combatLog: CombatLogEntry[];
  winnerId: string | null;
  buildings: BuildingState[];
  resourceNodes: Array<{
    id: string;
    kind: keyof PlayerResources;
    position: Vector2;
    remaining: number;
  }>;
  matchPhase: MatchPhase;
  countdownEndsAt: number | null;
  startedAt: number | null;
  totalPausedMs: number;
  pauseStartedAt: number | null;
  resumePhase: MatchPhase;
  resultSaved: boolean;
  victoryReason: string | null;
}

type CombatTarget = HeroState | UnitState | BuildingState;
const matchStore = new MatchStore();

const idleInput = (): PlayerInputMessage => ({
  type: "input",
  sequence: 0,
  movement: { x: 0, y: 0 },
  rotation: 0,
  dash: false
});

const emptyResources = (): PlayerResources => ({ gold: 0, wood: 0, food: 0 });

const emptyStats = (): MatchStats => ({
  resourcesGathered: emptyResources(),
  unitsProduced: 0,
  unitsLost: 0,
  buildingsBuilt: 0,
  buildingsDestroyed: 0,
  damageDealt: 0
});

const createBuilding = (
  ownerId: string,
  kind: BuildingState["kind"],
  position: Vector2
): BuildingState => {
  const blueprint = BUILDING_BLUEPRINTS[kind];
  return {
    id: randomUUID(),
    ownerId,
    kind,
    position,
    width: blueprint.width,
    height: blueprint.height,
    hp: blueprint.hp,
    maxHp: blueprint.hp,
    armor: blueprint.armor,
    supplyRadius: blueprint.supplyRadius,
    rallyPoint: { x: position.x + (position.x < MAP_SIZE.width / 2 ? 180 : -180), y: position.y },
    queue: []
  };
};

const spawnUnits = (ownerId: string, origin: Vector2): UnitState[] =>
  Array.from({ length: 36 }, (_, index) => {
    const kinds: UnitKind[] = [
      "swordsman",
      "spearman",
      "archer",
      "cavalry",
      "skirmisher",
      "guardian"
    ];
    const kind = kinds[index % kinds.length] ?? "swordsman";
    const blueprint = UNIT_BLUEPRINTS[kind];
    return {
      id: `${ownerId}-unit-${index}`,
      ownerId,
      position: {
        x: origin.x + (index % 6) * 34 - 85,
        y: origin.y + Math.floor(index / 6) * 34 + 70
      },
      destination: null,
      order: "stop" as const,
      kind,
      hp: blueprint.hp,
      maxHp: blueprint.hp,
      armor: blueprint.armor,
      damage: blueprint.damage,
      attackRange: blueprint.range,
      visionRadius: blueprint.vision,
      attackCooldownMs: blueprint.cooldown,
      targetId: null,
      morale: 100,
      facing: origin.x < MAP_SIZE.width / 2 ? 0 : Math.PI,
      formation: "line" as const,
      braced: false,
      panicked: false
    };
  });

const createSession = (slot: number, isBot = false): PlayerSession => {
  const id = randomUUID();
  const position = { ...(BASE_POSITIONS[slot] ?? BASE_POSITIONS[0]) };
  return {
    id,
    token: randomBytes(18).toString("hex"),
    socket: null,
    hero: {
      id,
      position,
      velocity: { x: 0, y: 0 },
      rotation: 0,
      lastProcessedInput: 0,
      connected: true,
      hp: 800,
      maxHp: 800,
      armor: 30
    },
    units: spawnUnits(id, position),
    unitPaths: new Map(),
    input: idleInput(),
    lastDashAt: 0,
    dashUntil: 0,
    attacksAt: new Map(),
    abilityReadyAt: new Map(),
    disconnectedAt: null,
    explored: new Set(),
    reveals: [],
    resources: { gold: 1100, wood: 900, food: 700 },
    gatherRates: emptyResources(),
    stats: emptyStats(),
    chargeDistance: new Map(),
    lastEconomyAt: 0,
    lastMoraleAt: 0,
    isBot,
    lastBotThinkAt: 0
  };
};

const send = (socket: WebSocket | null, message: ServerGameMessage) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};

const sanitizeRoomCode = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

export class RealtimeRoomServer {
  private readonly rooms = new Map<string, Room>();
  private readonly sockets = new Map<WebSocket, { room: Room; player: PlayerSession }>();
  private readonly webSocketServer: WebSocketServer;
  private readonly timer: NodeJS.Timeout;

  constructor(server: HttpServer) {
    this.webSocketServer = new WebSocketServer({ server, path: "/realtime" });
    this.webSocketServer.on("connection", (socket) => this.handleConnection(socket));
    this.timer = setInterval(() => this.tick(), 1000 / GAME_TICK_RATE);
  }

  close() {
    clearInterval(this.timer);
    this.webSocketServer.close();
  }

  private handleConnection(socket: WebSocket) {
    socket.on("message", (data) => {
      try {
        this.handleMessage(socket, JSON.parse(data.toString()) as ClientGameMessage);
      } catch {
        send(socket, { type: "error", message: "Thông điệp thời gian thực không hợp lệ" });
      }
    });
    socket.on("close", () => this.disconnect(socket));
  }

  private handleMessage(socket: WebSocket, message: ClientGameMessage) {
    if (message.type === "join") {
      this.join(socket, message.roomCode, message.reconnectToken);
      return;
    }
    const membership = this.sockets.get(socket);
    if (!membership) return;
    if (message.type === "input") this.acceptInput(membership.player, message);
    if (message.type === "unit-command")
      this.acceptUnitCommand(membership.room, membership.player, message);
    if (message.type === "attack") this.acceptAttack(membership.room, membership.player, message);
    if (message.type === "hero-ability")
      this.acceptHeroAbility(membership.room, membership.player, message);
    if (message.type === "place-building")
      this.placeBuilding(
        membership.room,
        membership.player,
        message.buildingKind,
        message.position
      );
    if (message.type === "queue-production")
      this.queueProduction(
        membership.room,
        membership.player,
        message.buildingId,
        message.unitKind
      );
    if (message.type === "set-rally")
      this.setRallyPoint(membership.room, membership.player, message.buildingId, message.position);
    if (message.type === "set-formation") {
      const ids = new Set(message.unitIds);
      for (const unit of membership.player.units)
        if (ids.has(unit.id)) unit.formation = message.formation;
    }
    if (message.type === "surrender") {
      const opponent = [...membership.room.players.values()].find(
        (player) => player.id !== membership.player.id
      );
      if (opponent) this.finishMatch(membership.room, opponent.id, "đối thủ đầu hàng");
    }
  }

  private join(socket: WebSocket, requestedCode: string, reconnectToken?: string) {
    const code = sanitizeRoomCode(requestedCode);
    if (code.length < 3) {
      send(socket, { type: "error", message: "Mã phòng cần có ít nhất 3 ký tự" });
      return;
    }
    const room = this.rooms.get(code) ?? {
      code,
      tick: 0,
      players: new Map<string, PlayerSession>(),
      projectiles: [],
      combatLog: [],
      winnerId: null,
      buildings: [],
      resourceNodes: RESOURCE_NODES.map((node) => ({
        ...node,
        position: { ...node.position },
        remaining: 5000
      })),
      matchPhase: "waiting" as const,
      countdownEndsAt: null,
      startedAt: null,
      totalPausedMs: 0,
      pauseStartedAt: null,
      resumePhase: "active" as const,
      resultSaved: false,
      victoryReason: null
    };
    this.rooms.set(code, room);
    const returning = reconnectToken
      ? [...room.players.values()].find((player) => player.token === reconnectToken)
      : undefined;
    const player =
      returning ?? (room.players.size < 2 ? createSession(room.players.size) : undefined);
    if (!player) {
      send(socket, { type: "error", message: "Phòng đã đủ người" });
      return;
    }
    if (!returning) {
      room.players.set(player.id, player);
      room.buildings.push(createBuilding(player.id, "headquarters", player.hero.position));
      this.log(room, "match", "Một chỉ huy đã thiết lập nhà chính");
      if (code.startsWith("BOT") && room.players.size === 1) {
        const bot = createSession(1, true);
        room.players.set(bot.id, bot);
        room.buildings.push(createBuilding(bot.id, "headquarters", bot.hero.position));
        this.log(room, "match", "Đối thủ máy đã sẵn sàng luyện tập");
      }
    }
    if (player.socket && player.socket !== socket) player.socket.close();
    player.socket = socket;
    player.disconnectedAt = null;
    player.hero.connected = true;
    this.sockets.set(socket, { room, player });
    if (room.players.size === 2 && room.matchPhase === "waiting") {
      room.matchPhase = "countdown";
      room.countdownEndsAt = Date.now() + 5000;
      this.log(room, "match", "Hai chỉ huy đã sẵn sàng. Trận đấu bắt đầu sau 5 giây");
    } else if (
      returning &&
      room.matchPhase === "paused" &&
      [...room.players.values()].every((session) => session.socket)
    ) {
      if (room.pauseStartedAt) {
        const pausedFor = Date.now() - room.pauseStartedAt;
        room.totalPausedMs += pausedFor;
        if (room.countdownEndsAt) room.countdownEndsAt += pausedFor;
      }
      room.pauseStartedAt = null;
      room.matchPhase = room.resumePhase;
      this.log(room, "match", "Chỉ huy đã kết nối lại. Trận đấu tiếp tục");
    }
    send(socket, {
      type: "joined",
      roomCode: code,
      playerId: player.id,
      reconnectToken: player.token,
      reconnected: Boolean(returning)
    });
  }

  private acceptInput(player: PlayerSession, input: PlayerInputMessage) {
    if (!Number.isFinite(input.sequence) || input.sequence <= player.input.sequence) return;
    player.input = {
      ...input,
      movement: {
        x: Number.isFinite(input.movement.x) ? input.movement.x : 0,
        y: Number.isFinite(input.movement.y) ? input.movement.y : 0
      }
    };
  }

  private acceptUnitCommand(room: Room, player: PlayerSession, command: UnitCommandMessage) {
    if (command.order === "attack" && command.targetId) {
      this.acceptAttack(room, player, {
        type: "attack",
        attackerIds: command.unitIds,
        targetId: command.targetId
      });
      return;
    }
    const requestedIds = new Set(command.unitIds);
    const destinations = command.destinations ?? [];
    let destinationIndex = 0;
    for (const unit of player.units) {
      if (!requestedIds.has(unit.id)) continue;
      const requested = destinations[destinationIndex++];
      unit.order = command.order;
      unit.targetId = null;
      if (!requested) {
        unit.destination = null;
        player.unitPaths.delete(unit.id);
        continue;
      }
      const destination = {
        x: Math.max(20, Math.min(MAP_SIZE.width - 20, requested.x)),
        y: Math.max(20, Math.min(MAP_SIZE.height - 20, requested.y))
      };
      const path = findServerPath(unit.position, destination);
      if (path.length === 0) continue;
      unit.destination = destination;
      player.unitPaths.set(unit.id, path);
    }
  }

  private acceptAttack(room: Room, player: PlayerSession, command: AttackCommandMessage) {
    const target = this.findEnemyTarget(room, player.id, command.targetId);
    if (!target) return;
    const attackers = new Set(command.attackerIds);
    for (const unit of player.units) {
      if (!attackers.has(unit.id)) continue;
      unit.order = "attack";
      unit.targetId = target.id;
      unit.destination = target.position;
      player.unitPaths.set(unit.id, findServerPath(unit.position, target.position));
    }
  }

  private acceptHeroAbility(room: Room, player: PlayerSession, message: HeroAbilityMessage) {
    const now = Date.now();
    if (
      (player.abilityReadyAt.get(message.ability) ?? 0) > now ||
      room.winnerId ||
      room.matchPhase !== "active"
    )
      return;
    const cooldowns: Record<HeroAbility, number> = {
      basic: 650,
      shockwave: 6000,
      "piercing-shot": 4500,
      scout: 12_000
    };
    if (message.ability === "basic") {
      const target = message.targetId
        ? this.findEnemyTarget(room, player.id, message.targetId)
        : undefined;
      if (!target || distanceBetween(player.hero.position, target.position) > 185) return;
      if (!hasLineOfSight(player.hero.position, target.position)) return;
      this.applyDamage(room, target, 48, "Đòn đánh của tướng", player.id);
    }
    if (message.ability === "shockwave") {
      const targets = this.enemyTargets(room, player.id).filter(
        (target) =>
          distanceBetween(player.hero.position, target.position) <= 190 &&
          hasLineOfSight(player.hero.position, target.position)
      );
      if (targets.length === 0) return;
      for (const target of targets)
        this.applyDamage(room, target, 52, "Xung lực Aether", player.id);
      this.log(room, "skill", `Xung lực Aether trúng ${targets.length} mục tiêu`);
    }
    if (message.ability === "piercing-shot") {
      const distance = distanceBetween(player.hero.position, message.target);
      if (distance > 650 || distance < 1 || !hasLineOfSight(player.hero.position, message.target))
        return;
      const speed = 560;
      room.projectiles.push({
        id: randomUUID(),
        ownerId: player.id,
        position: { ...player.hero.position },
        velocity: {
          x: ((message.target.x - player.hero.position.x) / distance) * speed,
          y: ((message.target.y - player.hero.position.y) / distance) * speed
        },
        damage: 70,
        expiresAt: now + 1400,
        label: "Phát bắn xuyên phá",
        unitKind: null,
        formation: null
      });
      this.log(room, "skill", "Lyra tung phát bắn xuyên phá");
    }
    if (message.ability === "scout") {
      if (distanceBetween(player.hero.position, message.target) > 760) return;
      player.reveals.push({ position: message.target, radius: 310, expiresAt: now + 6500 });
      this.log(room, "skill", "Pháo sáng trinh sát đã mở tầm nhìn một khu vực");
    }
    player.abilityReadyAt.set(message.ability, now + cooldowns[message.ability]);
  }

  private placeBuilding(
    room: Room,
    player: PlayerSession,
    kind: BuildingState["kind"],
    position: Vector2
  ) {
    if (room.matchPhase !== "active") return;
    const blueprint = BUILDING_BLUEPRINTS[kind];
    if (
      kind === "headquarters" &&
      room.buildings.some((building) => building.ownerId === player.id && building.kind === kind)
    ) {
      send(player.socket, { type: "error", message: "Mỗi chỉ huy chỉ được có một nhà chính" });
      return;
    }
    if (!canAfford(player.resources, blueprint.cost)) {
      send(player.socket, { type: "error", message: "Không đủ tài nguyên" });
      return;
    }
    const validation = validateBuildingPlacement(
      kind,
      position,
      player.id,
      room.buildings,
      room.resourceNodes
    );
    if (!validation.valid) {
      send(player.socket, {
        type: "error",
        message: `Vị trí xây không hợp lệ: ${validation.reason}`
      });
      return;
    }
    player.resources = deductResources(player.resources, blueprint.cost);
    room.buildings.push(createBuilding(player.id, kind, position));
    player.stats.buildingsBuilt += 1;
    this.log(room, "economy", `Đã xây xong ${BUILDING_NAMES[kind]}`);
  }

  private queueProduction(
    room: Room,
    player: PlayerSession,
    buildingId: string,
    unitKind: UnitKind
  ) {
    if (room.matchPhase !== "active") return;
    const building = room.buildings.find(
      (candidate) => candidate.id === buildingId && candidate.ownerId === player.id
    );
    if (!building || !producerAccepts(building.kind, unitKind) || building.queue.length >= 5)
      return;
    const blueprint = UNIT_BLUEPRINTS[unitKind];
    if (!canAfford(player.resources, blueprint.cost)) {
      send(player.socket, { type: "error", message: "Không đủ tài nguyên để huấn luyện đơn vị" });
      return;
    }
    if (
      this.supplyUsed(player) + blueprint.supply >
      calculateSupplyCap(room.buildings, player.id)
    ) {
      send(player.socket, { type: "error", message: "Đã đạt giới hạn quân số" });
      return;
    }
    player.resources = deductResources(player.resources, blueprint.cost);
    const previous = building.queue.at(-1)?.completesAt ?? Date.now();
    building.queue.push({
      id: randomUUID(),
      unitKind,
      completesAt: Math.max(Date.now(), previous) + blueprint.trainMs
    });
    this.log(room, "economy", `Đã thêm ${UNIT_NAMES[unitKind]} vào hàng chờ huấn luyện`);
  }

  private setRallyPoint(room: Room, player: PlayerSession, buildingId: string, position: Vector2) {
    const building = room.buildings.find(
      (candidate) => candidate.id === buildingId && candidate.ownerId === player.id
    );
    if (!building) return;
    building.rallyPoint = {
      x: Math.max(20, Math.min(MAP_SIZE.width - 20, position.x)),
      y: Math.max(20, Math.min(MAP_SIZE.height - 20, position.y))
    };
  }

  private supplyUsed(player: PlayerSession) {
    return player.units.reduce((total, unit) => total + UNIT_BLUEPRINTS[unit.kind].supply, 0);
  }

  private tick() {
    const now = Date.now();
    const delta = 1 / GAME_TICK_RATE;
    for (const room of this.rooms.values()) {
      room.tick += 1;
      this.updateMatchLifecycle(room, now);
      if (room.matchPhase === "active") {
        for (const player of room.players.values()) {
          if (player.isBot) this.updateBot(room, player, now);
          player.reveals = player.reveals.filter((reveal) => reveal.expiresAt > now);
          if (player.input.dash && now - player.lastDashAt >= DASH_COOLDOWN_MS) {
            player.lastDashAt = now;
            player.dashUntil = now + HERO_DASH_DURATION_MS;
          }
          const dashing = player.input.dash && now < player.dashUntil;
          player.hero = simulateHero(player.hero, player.input, delta, dashing);
          this.updateEconomy(room, player, now);
          this.moveUnits(room, player, delta, now);
        }
        this.processProduction(room, now);
        this.updateProjectiles(room, delta, now);
        this.removeDeadUnits(room);
        this.removeDeadBuildings(room);
        this.resolveWinner(room);
      }
      for (const player of room.players.values())
        send(player.socket, this.snapshotFor(room, player));
      this.expireDisconnected(room, now);
    }
  }

  private updateMatchLifecycle(room: Room, now: number) {
    if (room.matchPhase === "countdown" && room.countdownEndsAt && now >= room.countdownEndsAt) {
      room.matchPhase = "active";
      room.startedAt = now;
      room.countdownEndsAt = null;
      this.log(room, "match", "Trận đấu bắt đầu");
    }
    if (room.matchPhase !== "active" || !room.startedAt) return;
    const elapsed = now - room.startedAt - room.totalPausedMs;
    if (elapsed < 25 * 60 * 1000) return;
    const scores = [...room.players.values()].map((player) => ({
      id: player.id,
      score:
        player.units.length * 20 +
        room.buildings
          .filter((building) => building.ownerId === player.id)
          .reduce((total, building) => total + building.hp, 0)
    }));
    scores.sort((left, right) => right.score - left.score);
    const winner = scores[0]?.id;
    if (winner) this.finishMatch(room, winner, "điểm khi hết thời gian");
  }

  private updateBot(room: Room, bot: PlayerSession, now: number) {
    if (now - bot.lastBotThinkAt < 900) return;
    bot.lastBotThinkAt = now;
    const enemies = this.enemyTargets(room, bot.id).map((target) => ({
      id: target.id,
      position: target.position
    }));
    const headquarters = room.buildings.find(
      (building) => building.ownerId !== bot.id && building.kind === "headquarters"
    );
    if (!headquarters) return;
    for (const order of planBotOrders(bot.units, enemies, headquarters.position)) {
      const unit = bot.units.find((candidate) => candidate.id === order.unitId);
      if (!unit) continue;
      unit.targetId = order.targetId;
      unit.order = order.targetId ? "attack" : "move";
      unit.destination = order.destination;
      bot.unitPaths.set(unit.id, findServerPath(unit.position, order.destination));
    }
    const dx = headquarters.position.x - bot.hero.position.x;
    const dy = headquarters.position.y - bot.hero.position.y;
    const length = Math.hypot(dx, dy) || 1;
    bot.input = {
      type: "input",
      sequence: bot.input.sequence + 1,
      movement: { x: dx / length, y: dy / length },
      rotation: Math.atan2(dy, dx),
      dash: false
    };
  }

  private updateEconomy(room: Room, player: PlayerSession, now: number) {
    if (now - player.lastEconomyAt < 1000) return;
    player.lastEconomyAt = now;
    player.gatherRates = calculateGatherRates(player.units, room.resourceNodes);
    for (const kind of ["gold", "wood", "food"] as const) {
      const gathered = Math.min(player.gatherRates[kind], this.remainingResource(room, kind));
      player.resources[kind] += gathered;
      player.stats.resourcesGathered[kind] += gathered;
      this.consumeResource(room, kind, gathered);
    }
    if (now - player.lastMoraleAt >= 1000) {
      player.lastMoraleAt = now;
      const headquarters = room.buildings.find(
        (building) => building.ownerId === player.id && building.kind === "headquarters"
      );
      for (const unit of player.units) {
        if (
          distanceBetween(unit.position, player.hero.position) < 260 ||
          (headquarters && distanceBetween(unit.position, headquarters.position) < 280)
        ) {
          unit.morale = moraleAfterEvent(unit.morale, "recover");
          if (unit.morale >= 35) unit.panicked = false;
        }
      }
    }
  }

  private remainingResource(room: Room, kind: keyof PlayerResources) {
    return room.resourceNodes
      .filter((node) => node.kind === kind)
      .reduce((total, node) => total + node.remaining, 0);
  }

  private consumeResource(room: Room, kind: keyof PlayerResources, amount: number) {
    let remaining = amount;
    for (const node of room.resourceNodes) {
      if (node.kind !== kind || remaining <= 0) continue;
      const consumed = Math.min(node.remaining, remaining);
      node.remaining -= consumed;
      remaining -= consumed;
    }
  }

  private processProduction(room: Room, now: number) {
    for (const building of room.buildings) {
      const item = building.queue[0];
      if (!item || item.completesAt > now) continue;
      const player = room.players.get(building.ownerId);
      if (!player) continue;
      const blueprint = UNIT_BLUEPRINTS[item.unitKind];
      if (
        this.supplyUsed(player) + blueprint.supply >
        calculateSupplyCap(room.buildings, player.id)
      ) {
        item.completesAt = now + 1000;
        continue;
      }
      building.queue.shift();
      const unit = this.createProducedUnit(player.id, item.unitKind, {
        x: building.position.x,
        y: building.position.y + building.height / 2 + 28
      });
      player.units.push(unit);
      player.unitPaths.set(unit.id, findServerPath(unit.position, building.rallyPoint));
      unit.destination = building.rallyPoint;
      unit.order = "move";
      player.stats.unitsProduced += 1;
      this.log(room, "economy", `${UNIT_NAMES[item.unitKind]} đã ra trận`);
    }
  }

  private createProducedUnit(ownerId: string, kind: UnitKind, position: Vector2): UnitState {
    const blueprint = UNIT_BLUEPRINTS[kind];
    return {
      id: `${ownerId}-unit-${randomUUID()}`,
      ownerId,
      position,
      destination: null,
      order: "stop",
      kind,
      hp: blueprint.hp,
      maxHp: blueprint.hp,
      armor: blueprint.armor,
      damage: blueprint.damage,
      attackRange: blueprint.range,
      visionRadius: blueprint.vision,
      attackCooldownMs: blueprint.cooldown,
      targetId: null,
      morale: 100,
      facing: 0,
      formation: "line",
      braced: false,
      panicked: false
    };
  }

  private moveUnits(room: Room, player: PlayerSession, delta: number, now: number) {
    for (const unit of player.units) {
      unit.braced = unit.kind === "spearman" && unit.order === "hold";
      if (unit.morale < 25 && !unit.panicked) {
        unit.panicked = true;
        unit.order = "retreat";
        unit.targetId = null;
        const headquarters = room.buildings.find(
          (building) => building.ownerId === player.id && building.kind === "headquarters"
        );
        if (headquarters) {
          unit.destination = headquarters.position;
          player.unitPaths.set(unit.id, findServerPath(unit.position, headquarters.position));
        }
        this.log(room, "morale", `${UNIT_NAMES[unit.kind]} hoảng loạn và rút lui`);
      }
      this.updateUnitCombat(room, player, unit, now);
      const path = player.unitPaths.get(unit.id);
      const waypoint = path?.[0];
      if (!waypoint || unit.order === "hold") continue;
      const distance = distanceBetween(unit.position, waypoint);
      if (distance < 3) {
        unit.position = waypoint;
        path?.shift();
        if (path?.length === 0 && unit.order !== "attack") {
          unit.destination = null;
          unit.order = "stop";
        }
        continue;
      }
      const step = Math.min(distance, UNIT_BLUEPRINTS[unit.kind].speed * delta);
      unit.facing = Math.atan2(waypoint.y - unit.position.y, waypoint.x - unit.position.x);
      if (unit.kind === "cavalry")
        player.chargeDistance.set(unit.id, (player.chargeDistance.get(unit.id) ?? 0) + step);
      unit.position = {
        x: unit.position.x + ((waypoint.x - unit.position.x) / distance) * step,
        y: unit.position.y + ((waypoint.y - unit.position.y) / distance) * step
      };
    }
  }

  private updateUnitCombat(room: Room, player: PlayerSession, unit: UnitState, now: number) {
    let target = unit.targetId ? this.findEnemyTarget(room, player.id, unit.targetId) : undefined;
    if (!target && unit.order !== "hold") {
      target = this.enemyTargets(room, player.id)
        .filter((candidate) => distanceBetween(unit.position, candidate.position) <= 280)
        .sort(
          (left, right) =>
            distanceBetween(unit.position, left.position) -
            distanceBetween(unit.position, right.position)
        )[0];
      if (target) unit.targetId = target.id;
    }
    if (!target) return;
    const distance = distanceBetween(unit.position, target.position);
    if (distance > unit.attackRange || !hasLineOfSight(unit.position, target.position)) {
      if (unit.order === "attack" && (player.unitPaths.get(unit.id)?.length ?? 0) === 0) {
        unit.destination = target.position;
        player.unitPaths.set(unit.id, findServerPath(unit.position, target.position));
      }
      return;
    }
    player.unitPaths.delete(unit.id);
    if ((player.attacksAt.get(unit.id) ?? 0) + unit.attackCooldownMs > now) return;
    player.attacksAt.set(unit.id, now);
    const tactical = this.tacticalDamage(player, unit, target);
    if (unit.kind === "archer" || unit.kind === "skirmisher") {
      const speed = 430;
      room.projectiles.push({
        id: randomUUID(),
        ownerId: player.id,
        position: { ...unit.position },
        velocity: {
          x: ((target.position.x - unit.position.x) / Math.max(1, distance)) * speed,
          y: ((target.position.y - unit.position.y) / Math.max(1, distance)) * speed
        },
        damage: tactical.damage,
        expiresAt: now + 1500,
        label: tactical.label,
        unitKind: unit.kind,
        formation: unit.formation
      });
    } else {
      this.applyDamage(room, target, tactical.damage, tactical.label, player.id);
    }
    player.chargeDistance.set(unit.id, 0);
  }

  private tacticalDamage(player: PlayerSession, attacker: UnitState, target: CombatTarget) {
    let modifier = 1;
    const reasons: string[] = [];
    const ranged = attacker.attackRange > 100;
    if ("visionRadius" in target) {
      const counter = counterModifier(attacker.kind, target.kind);
      if (counter !== 1) reasons.push(counter > 1 ? "khắc chế" : "bất lợi");
      modifier *= counter;
      const facing = facingModifier(attacker.position, target.position, target.facing);
      modifier *= facing.modifier;
      if (facing.reason !== "chính diện") {
        reasons.push(facing.reason);
        target.morale = moraleAfterEvent(target.morale, "flanked");
      }
      modifier *= formationDefenseModifier(target.formation, ranged);
      if (attacker.kind === "cavalry" && (player.chargeDistance.get(attacker.id) ?? 0) >= 140) {
        modifier *= target.kind === "spearman" && target.braced ? 0.6 : 1.55;
        reasons.push(target.kind === "spearman" && target.braced ? "chống giáo" : "xung kích");
      }
    }
    modifier *= formationDamageModifier(attacker.formation, attacker.kind, ranged);
    if (terrainAt(attacker.position, "hill") && !terrainAt(target.position, "hill")) {
      modifier *= 1.15;
      reasons.push("địa hình cao");
    }
    return {
      damage: Math.max(1, Math.round(attacker.damage * modifier)),
      label: `${UNIT_NAMES[attacker.kind]}${reasons.length > 0 ? ` (${reasons.join(", ")})` : ""}`
    };
  }

  private updateProjectiles(room: Room, delta: number, now: number) {
    const survivors: ServerProjectile[] = [];
    for (const projectile of room.projectiles) {
      if (projectile.expiresAt <= now) continue;
      const next = advanceProjectile(projectile, delta) as ServerProjectile;
      if (!hasLineOfSight(projectile.position, next.position)) continue;
      const target = this.enemyTargets(room, projectile.ownerId).find(
        (candidate) => distanceBetween(next.position, candidate.position) <= 18
      );
      if (target) {
        this.applyDamage(room, target, projectile.damage, projectile.label, projectile.ownerId);
        continue;
      }
      if (
        next.position.x < 0 ||
        next.position.y < 0 ||
        next.position.x > MAP_SIZE.width ||
        next.position.y > MAP_SIZE.height
      )
        continue;
      survivors.push(next);
    }
    room.projectiles = survivors;
  }

  private applyDamage(
    room: Room,
    target: CombatTarget,
    rawDamage: number,
    label: string,
    attackerOwnerId: string | null = null
  ) {
    if (target.hp <= 0) return;
    const damage = calculateDamage(rawDamage, target.armor);
    target.hp = Math.max(0, target.hp - damage);
    const attacker = attackerOwnerId ? room.players.get(attackerOwnerId) : undefined;
    if (attacker) attacker.stats.damageDealt += damage;
    this.log(room, target.hp === 0 ? "death" : "hit", `${label} gây ${damage} sát thương`);
  }

  private removeDeadUnits(room: Room) {
    for (const player of room.players.values()) {
      const dead = player.units.filter((unit) => unit.hp <= 0);
      for (const unit of dead) {
        player.unitPaths.delete(unit.id);
        player.attacksAt.delete(unit.id);
        player.chargeDistance.delete(unit.id);
        player.stats.unitsLost += 1;
        for (const ally of player.units) {
          if (ally.id !== unit.id && distanceBetween(ally.position, unit.position) <= 220)
            ally.morale = moraleAfterEvent(ally.morale, "ally-death");
        }
      }
      player.units = player.units.filter((unit) => unit.hp > 0);
    }
  }

  private removeDeadBuildings(room: Room) {
    const dead = room.buildings.filter((building) => building.hp <= 0);
    for (const building of dead) {
      const owner = room.players.get(building.ownerId);
      const opponent = [...room.players.values()].find((player) => player.id !== building.ownerId);
      if (opponent) opponent.stats.buildingsDestroyed += 1;
      this.log(room, "death", `${BUILDING_NAMES[building.kind]} đã bị phá hủy`);
      if (building.kind === "headquarters") {
        if (owner)
          for (const unit of owner.units) unit.morale = moraleAfterEvent(unit.morale, "hq-lost");
        if (opponent) this.finishMatch(room, opponent.id, "nhà chính bị phá hủy");
      }
    }
    room.buildings = room.buildings.filter((building) => building.hp > 0);
  }

  private resolveWinner(room: Room) {
    if (room.winnerId || room.players.size < 2) return;
    const playersWithHeadquarters = [...room.players.values()].filter((player) =>
      room.buildings.some(
        (building) => building.ownerId === player.id && building.kind === "headquarters"
      )
    );
    if (playersWithHeadquarters.length === 1)
      this.finishMatch(room, playersWithHeadquarters[0]?.id ?? "", "nhà chính bị phá hủy");
  }

  private finishMatch(room: Room, winnerId: string, reason: string) {
    if (room.winnerId || !winnerId) return;
    room.winnerId = winnerId;
    room.victoryReason = reason;
    room.matchPhase = "finished";
    this.log(room, "victory", `Chiến thắng do ${reason}`);
    if (room.resultSaved) return;
    room.resultSaved = true;
    const finishedAt = Date.now();
    const stats = Object.fromEntries(
      [...room.players.values()].map((player) => [player.id, player.stats])
    );
    void matchStore.save({
      roomCode: room.code,
      winnerId,
      reason,
      startedAt: room.startedAt ?? finishedAt,
      finishedAt,
      stats,
      events: room.combatLog
    });
  }

  private snapshotFor(room: Room, player: PlayerSession): GameSnapshot {
    const sources: VisionSource[] = [
      { position: player.hero.position, visionRadius: HERO_VISION },
      ...player.units.map((unit) => ({ position: unit.position, visionRadius: unit.visionRadius })),
      ...room.buildings
        .filter((building) => building.ownerId === player.id)
        .map((building) => ({
          position: building.position,
          visionRadius:
            building.kind === "watchtower" ? 560 : building.kind === "headquarters" ? 360 : 190
        }))
    ];
    const visible = (target: CombatTarget) =>
      target.id === player.id ||
      ("ownerId" in target && target.ownerId === player.id) ||
      canSeePosition(sources, target.position, player.reveals);
    return {
      type: "snapshot",
      roomCode: room.code,
      serverTime: Date.now(),
      tick: room.tick,
      heroes: [...room.players.values()].map((session) => session.hero).filter(visible),
      units: [...room.players.values()].flatMap((session) => session.units).filter(visible),
      buildings: room.buildings.filter(visible),
      resourceNodes: room.resourceNodes,
      projectiles: room.projectiles
        .filter(
          (projectile) =>
            projectile.ownerId === player.id ||
            canSeePosition(sources, projectile.position, player.reveals)
        )
        .map((projectile) => ({
          id: projectile.id,
          ownerId: projectile.ownerId,
          position: projectile.position,
          velocity: projectile.velocity
        })),
      combatLog: room.combatLog.slice(-10),
      vision: computeVisionState(sources, player.explored, player.reveals),
      winnerId: room.winnerId,
      roomPlayerCount: room.players.size,
      economy: {
        resources: player.resources,
        supplyUsed: this.supplyUsed(player),
        supplyCap: calculateSupplyCap(room.buildings, player.id),
        gatherRates: player.gatherRates
      },
      stats: player.stats,
      match: {
        phase: room.matchPhase,
        countdownEndsAt: room.countdownEndsAt,
        startedAt: room.startedAt,
        elapsedMs: room.startedAt
          ? Math.max(0, Date.now() - room.startedAt - room.totalPausedMs)
          : 0,
        pauseReason: room.matchPhase === "paused" ? "Đang chờ chỉ huy mất kết nối" : null,
        targetDurationMs: 25 * 60 * 1000
      }
    };
  }

  private enemyTargets(room: Room, ownerId: string): CombatTarget[] {
    return [...room.players.values()]
      .filter((player) => player.id !== ownerId)
      .flatMap((player) => [
        player.hero,
        ...player.units,
        ...room.buildings.filter((building) => building.ownerId === player.id)
      ])
      .filter((target) => target.hp > 0);
  }

  private findEnemyTarget(room: Room, ownerId: string, targetId: string) {
    return this.enemyTargets(room, ownerId).find((target) => target.id === targetId);
  }

  private log(room: Room, kind: CombatLogEntry["kind"], text: string) {
    room.combatLog.push({ id: randomUUID(), tick: room.tick, kind, text });
    if (room.combatLog.length > 40) room.combatLog.shift();
  }

  private disconnect(socket: WebSocket) {
    const membership = this.sockets.get(socket);
    if (!membership) return;
    membership.player.socket = null;
    membership.player.disconnectedAt = Date.now();
    membership.player.hero.connected = false;
    if (membership.room.matchPhase === "active" || membership.room.matchPhase === "countdown") {
      membership.room.resumePhase = membership.room.matchPhase;
      membership.room.matchPhase = "paused";
      membership.room.pauseStartedAt = Date.now();
      this.log(membership.room, "match", "Trận đấu tạm dừng để chờ kết nối lại");
    }
    this.sockets.delete(socket);
  }

  private expireDisconnected(room: Room, now: number) {
    for (const player of room.players.values()) {
      if (player.disconnectedAt && now - player.disconnectedAt > RECONNECT_WINDOW_MS) {
        const opponent = [...room.players.values()].find((candidate) => candidate.id !== player.id);
        if (opponent && room.matchPhase !== "finished")
          this.finishMatch(room, opponent.id, "đối thủ quá hạn kết nối lại");
        room.players.delete(player.id);
      }
    }
    if (room.players.size === 0) this.rooms.delete(room.code);
  }
}

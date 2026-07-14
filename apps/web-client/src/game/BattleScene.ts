import {
  HERO_DASH_SPEED,
  HERO_SPEED,
  BASE_POSITIONS,
  MAP_OBSTACLES,
  MAP_SIZE,
  TERRAIN_ZONES,
  type BuildingKind,
  type BuildingState,
  type FormationPreset,
  type GameSnapshot,
  type HeroState,
  type PlayerInputMessage,
  type ProjectileState,
  type ResourceNodeState,
  type UnitOrder,
  type UnitKind,
  type UnitState,
  type Vector2
} from "@aetherion/shared-types";
import Phaser from "phaser";

import { keybinds, gameColors } from "./config";
import { createFormation } from "./formation";
import { GameNetwork, type ConnectionStatus } from "./network";
import { findPath } from "./pathfinding";

interface UnitView {
  state: UnitState;
  sprite: Phaser.GameObjects.Arc;
  path: Vector2[];
}

interface TimedHero {
  receivedAt: number;
  state: HeroState;
}

interface BuildingView {
  state: BuildingState;
  sprite: Phaser.GameObjects.Rectangle;
}

type StatusCallback = (status: ConnectionStatus, detail: string, playerCount?: number) => void;

const BUILDING_PREVIEWS: Record<BuildingKind, { width: number; height: number; color: number }> = {
  headquarters: { width: 150, height: 130, color: 0xd5a93f },
  barracks: { width: 112, height: 94, color: 0xb95d4b },
  "archery-range": { width: 112, height: 94, color: 0x568b72 },
  storehouse: { width: 86, height: 78, color: 0x987b52 },
  watchtower: { width: 64, height: 64, color: 0x7a8fa3 }
};

const UNIT_COLORS: Record<UnitKind, number> = {
  swordsman: 0x38d6b1,
  spearman: 0x83d483,
  archer: 0xd5a93f,
  cavalry: 0x69a6e8,
  skirmisher: 0xda8ec7,
  guardian: 0xb8c1c8
};

const BUILDING_NAMES: Record<BuildingKind, string> = {
  headquarters: "nhà chính",
  barracks: "doanh trại",
  "archery-range": "trường bắn",
  storehouse: "kho lương",
  watchtower: "tháp canh"
};

const FORMATION_NAMES: Record<FormationPreset, string> = {
  line: "hàng ngang",
  wedge: "mũi nhọn",
  box: "hộp",
  spread: "giãn cách"
};

const LOG_KIND_NAMES: Record<GameSnapshot["combatLog"][number]["kind"], string> = {
  hit: "đòn đánh",
  death: "tổn thất",
  skill: "kỹ năng",
  victory: "chiến thắng",
  economy: "kinh tế",
  morale: "sĩ khí",
  match: "trận đấu"
};

export class BattleScene extends Phaser.Scene {
  private readonly roomCode: string;
  private readonly statusCallback: StatusCallback;
  private network?: GameNetwork;
  private playerId = "";
  private localHero?: Phaser.Physics.Arcade.Sprite;
  private readonly remoteHeroes = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private readonly remoteBuffers = new Map<string, TimedHero[]>();
  private readonly units = new Map<string, UnitView>();
  private readonly projectiles = new Map<string, Phaser.GameObjects.Arc>();
  private readonly buildings = new Map<string, BuildingView>();
  private readonly resourceNodes = new Map<string, Phaser.GameObjects.Arc>();
  private selectedIds = new Set<string>();
  private readonly controlGroups = new Map<number, string[]>();
  private selectionStart: Phaser.Math.Vector2 | undefined;
  private selectionGraphics?: Phaser.GameObjects.Graphics;
  private debugText?: Phaser.GameObjects.Text;
  private combatText?: Phaser.GameObjects.Text;
  private winnerText?: Phaser.GameObjects.Text;
  private fogGraphics?: Phaser.GameObjects.Graphics;
  private minimapGraphics?: Phaser.GameObjects.Graphics;
  private healthGraphics?: Phaser.GameObjects.Graphics;
  private placementGraphics?: Phaser.GameObjects.Graphics;
  private economyText?: Phaser.GameObjects.Text;
  private objectiveText?: Phaser.GameObjects.Text;
  private localHeroState: HeroState | undefined;
  private keys?: Record<"up" | "down" | "left" | "right" | "dash", Phaser.Input.Keyboard.Key>;
  private inputSequence = 0;
  private lastInputSentAt = 0;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private panAnchor: Phaser.Math.Vector2 | undefined;
  private activeAnimation = "idle";
  private currentMatchPhase: GameSnapshot["match"]["phase"] = "waiting";
  private pendingBuilding: BuildingKind | null = null;
  private selectedBuildingId: string | null = null;
  private formationPreset: FormationPreset = "box";
  private latestSnapshot: GameSnapshot | null = null;
  private readonly seenLogIds = new Set<string>();
  private audioContext: AudioContext | null = null;

  constructor(roomCode: string, statusCallback: StatusCallback) {
    super({ key: "battle" });
    this.roomCode = roomCode;
    this.statusCallback = statusCallback;
  }

  create() {
    this.createTextures();
    this.createMap();
    this.createHero();
    this.configureCamera();
    this.configureInput();
    this.createHud();

    this.network = new GameNetwork(this.roomCode, {
      onJoined: (message) => {
        this.playerId = message.playerId;
      },
      onSnapshot: (snapshot) => this.applySnapshot(snapshot),
      onStatus: (status, detail) => this.statusCallback(status, detail)
    });
    this.network.connect();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.network?.close();
      void this.audioContext?.close();
    });
  }

  update(time: number, delta: number) {
    this.updateHero(time);
    this.updateRemoteHeroes(time);
    this.updateUnits(delta / 1000);
    this.drawHealthBars();
    this.updateDebug();
  }

  private createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(gameColors.ground).fillRect(0, 0, 64, 64);
    graphics.lineStyle(1, gameColors.grid, 0.35).strokeRect(0, 0, 64, 64);
    graphics.fillStyle(gameColors.groundAlternate).fillRect(64, 0, 64, 64);
    graphics.lineStyle(1, gameColors.grid, 0.35).strokeRect(64, 0, 64, 64);
    graphics.generateTexture("terrain", 128, 64);
    graphics.clear().fillStyle(gameColors.obstacle).fillRect(0, 0, 8, 8);
    graphics.lineStyle(1, gameColors.obstacleEdge).strokeRect(0, 0, 8, 8);
    graphics.generateTexture("obstacle", 8, 8);
    for (const [name, color] of [
      ["hero-idle", gameColors.local],
      ["hero-run", 0x8de7c9],
      ["hero-dash", gameColors.selected],
      ["hero-remote", gameColors.remote]
    ] as const) {
      graphics.clear().fillStyle(color).fillCircle(24, 24, 22);
      graphics.fillStyle(0x102b27).fillTriangle(39, 24, 25, 17, 25, 31);
      graphics.generateTexture(name, 48, 48);
    }
    graphics.destroy();
  }

  private createMap() {
    const rows = Math.ceil(MAP_SIZE.height / 64);
    const columns = Math.ceil(MAP_SIZE.width / 64);
    const data = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => ((row + column) % 7 === 0 ? 1 : 0))
    );
    const map = this.make.tilemap({ data, tileWidth: 64, tileHeight: 64 });
    const tileset = map.addTilesetImage("terrain", "terrain", 64, 64, 0, 0, 0);
    if (tileset) map.createLayer(0, tileset, 0, 0)?.setAlpha(0.98);
    const terrain = this.add.graphics().setDepth(1);
    for (const zone of TERRAIN_ZONES) {
      if (zone.kind === "forest") {
        terrain.fillStyle(0x0b2c22, 0.8).fillRect(zone.x, zone.y, zone.width, zone.height);
        terrain.lineStyle(2, 0x397052, 0.65).strokeRect(zone.x, zone.y, zone.width, zone.height);
        for (let x = zone.x + 24; x < zone.x + zone.width; x += 46) {
          for (let y = zone.y + 24; y < zone.y + zone.height; y += 46) {
            terrain.fillStyle(0x286045, 0.75).fillCircle(x, y, 11);
          }
        }
      } else {
        terrain
          .fillStyle(0x8a7449, 0.35)
          .fillEllipse(zone.x + zone.width / 2, zone.y + zone.height / 2, zone.width, zone.height);
        terrain
          .lineStyle(3, 0xc2a863, 0.45)
          .strokeEllipse(
            zone.x + zone.width / 2,
            zone.y + zone.height / 2,
            zone.width * 0.72,
            zone.height * 0.68
          );
      }
    }
    terrain.fillStyle(0x173b4a, 0.72).fillRect(0, 690, MAP_SIZE.width, 180);
    terrain.fillStyle(0x8b7857, 1).fillRect(1040, 680, 320, 200);
    terrain.lineStyle(3, 0xd1ba78, 0.75).strokeRect(1040, 680, 320, 200);
    terrain.lineStyle(4, 0x38d6b1, 0.35).strokeCircle(1200, 800, 245);
    terrain.lineStyle(3, 0xd5a93f, 0.55).strokeCircle(260, 260, 230);
    terrain.lineStyle(3, 0xf0705a, 0.55).strokeCircle(2140, 1340, 230);
    this.physics.world.setBounds(0, 0, MAP_SIZE.width, MAP_SIZE.height);

    const obstacles = this.physics.add.staticGroup();
    for (const obstacle of MAP_OBSTACLES) {
      const body = obstacles
        .create(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2, "obstacle")
        .setDisplaySize(obstacle.width, obstacle.height)
        .refreshBody() as Phaser.Physics.Arcade.Sprite;
      body.setDepth(3);
    }
    this.data.set("obstacles", obstacles);
  }

  private createHero() {
    const initialPosition = BASE_POSITIONS[0];
    this.localHero = this.physics.add
      .sprite(initialPosition.x, initialPosition.y, "hero-idle")
      .setDepth(8)
      .setCollideWorldBounds(true);
    this.localHero.body?.setCircle(22, 2, 2);
    const obstacles = this.data.get("obstacles") as Phaser.Physics.Arcade.StaticGroup;
    this.physics.add.collider(this.localHero, obstacles);
  }

  private configureCamera() {
    if (!this.localHero) return;
    this.cameras.main.setBounds(0, 0, MAP_SIZE.width, MAP_SIZE.height);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.localHero, true, 0.12, 0.12);
    this.cameras.main.setZoom(1);
  }

  private configureInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.keys = {
      up: keyboard.addKey(keybinds.up),
      down: keyboard.addKey(keybinds.down),
      left: keyboard.addKey(keybinds.left),
      right: keyboard.addKey(keybinds.right),
      dash: keyboard.addKey(keybinds.dash)
    };
    keyboard.on("keydown", (event: KeyboardEvent) => this.handleCommandKey(event));
    this.input.mouse?.disableContextMenu();
    this.input.on(
      "wheel",
      (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        this.cameras.main.zoomTo(
          Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.65, 1.55),
          120
        );
      }
    );
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.pointerDown(pointer));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.pointerMove(pointer));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.pointerUp(pointer));
  }

  private createHud() {
    this.selectionGraphics = this.add.graphics().setDepth(50);
    this.placementGraphics = this.add.graphics().setDepth(45);
    this.healthGraphics = this.add.graphics().setDepth(9);
    this.fogGraphics = this.add.graphics().setDepth(20);
    this.minimapGraphics = this.add.graphics().setScrollFactor(0).setDepth(110);
    this.debugText = this.add
      .text(16, 76, "", {
        color: "#d9f7ef",
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontSize: "12px",
        backgroundColor: "#0a1c19cc",
        padding: { x: 10, y: 8 }
      })
      .setScrollFactor(0)
      .setDepth(100);
    this.combatText = this.add
      .text(16, 168, "", {
        color: "#eadfba",
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontSize: "11px",
        backgroundColor: "#0a1c19cc",
        padding: { x: 10, y: 8 },
        lineSpacing: 3
      })
      .setScrollFactor(0)
      .setDepth(100);
    this.winnerText = this.add
      .text(this.scale.width / 2, 70, "", {
        color: "#fff4cd",
        fontFamily: "Georgia, serif",
        fontSize: "24px",
        backgroundColor: "#0a1c19e8",
        padding: { x: 24, y: 14 },
        align: "center",
        wordWrap: { width: Math.max(260, Math.min(560, this.scale.width - 48)) }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(120)
      .setVisible(false);
    this.economyText = this.add
      .text(this.scale.width / 2, 14, "", {
        color: "#fff4cd",
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontSize: "12px",
        backgroundColor: "#0a1c19dd",
        padding: { x: 12, y: 8 }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(115);
    this.objectiveText = this.add
      .text(this.scale.width / 2, 52, "", {
        color: "#e8f3ef",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        backgroundColor: "#0a1c19cc",
        padding: { x: 12, y: 7 }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(114);
  }

  private updateHero(time: number) {
    if (!this.localHero || !this.keys) return;
    if (this.currentMatchPhase !== "active") {
      this.localHero.setVelocity(0, 0);
      return;
    }
    const movement = new Phaser.Math.Vector2(
      Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      Number(this.keys.down.isDown) - Number(this.keys.up.isDown)
    );
    if (movement.lengthSq() > 0) movement.normalize();
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.dash) &&
      time >= this.dashReadyAt &&
      movement.lengthSq() > 0
    ) {
      this.dashUntil = time + 150;
      this.dashReadyAt = time + 850;
    }
    const dashing = time < this.dashUntil;
    const speed = dashing ? HERO_DASH_SPEED : HERO_SPEED;
    this.localHero.setVelocity(movement.x * speed, movement.y * speed);
    const pointer = this.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.localHero.rotation = Phaser.Math.Angle.Between(
      this.localHero.x,
      this.localHero.y,
      worldPoint.x,
      worldPoint.y
    );
    this.setHeroAnimation(dashing ? "dash" : movement.lengthSq() > 0 ? "run" : "idle");

    if (time - this.lastInputSentAt >= 45) {
      this.lastInputSentAt = time;
      const message: PlayerInputMessage = {
        type: "input",
        sequence: ++this.inputSequence,
        movement: { x: movement.x, y: movement.y },
        rotation: this.localHero.rotation,
        dash: dashing
      };
      this.network?.send(message);
    }
  }

  private setHeroAnimation(state: "idle" | "run" | "dash") {
    if (!this.localHero || state === this.activeAnimation) return;
    this.activeAnimation = state;
    this.localHero.setTexture(`hero-${state}`);
    this.tweens.killTweensOf(this.localHero);
    if (state === "idle") this.localHero.setScale(1);
    if (state === "run")
      this.tweens.add({
        targets: this.localHero,
        scaleX: 1.05,
        scaleY: 0.95,
        yoyo: true,
        repeat: -1,
        duration: 120
      });
    if (state === "dash") this.localHero.setScale(1.18, 0.82);
  }

  private applySnapshot(snapshot: GameSnapshot) {
    this.latestSnapshot = snapshot;
    window.dispatchEvent(new CustomEvent<GameSnapshot>("aetherion:snapshot", { detail: snapshot }));
    for (const entry of snapshot.combatLog) {
      if (this.seenLogIds.has(entry.id)) continue;
      this.seenLogIds.add(entry.id);
      if (entry.kind === "hit" || entry.kind === "death") this.createCombatEffect(entry.kind);
    }
    this.currentMatchPhase = snapshot.match.phase;
    const now = performance.now();
    const localState = snapshot.heroes.find((hero) => hero.id === this.playerId);
    this.localHeroState = localState;
    if (localState && this.localHero) {
      if (snapshot.match.phase !== "active") {
        this.localHero.setVelocity(0, 0);
        this.localHero.setPosition(localState.position.x, localState.position.y);
        return this.applySnapshotEntities(snapshot, now);
      }
      const distance = Phaser.Math.Distance.Between(
        this.localHero.x,
        this.localHero.y,
        localState.position.x,
        localState.position.y
      );
      const correction = distance > 180 ? 1 : 0.12;
      this.localHero.x = Phaser.Math.Linear(this.localHero.x, localState.position.x, correction);
      this.localHero.y = Phaser.Math.Linear(this.localHero.y, localState.position.y, correction);
    }
    this.applySnapshotEntities(snapshot, now);
  }

  private applySnapshotEntities(snapshot: GameSnapshot, now: number) {
    for (const hero of snapshot.heroes) {
      if (hero.id === this.playerId) continue;
      const buffer = this.remoteBuffers.get(hero.id) ?? [];
      buffer.push({ receivedAt: now, state: hero });
      this.remoteBuffers.set(hero.id, buffer.slice(-8));
    }
    const visibleHeroIds = new Set(snapshot.heroes.map((hero) => hero.id));
    for (const [id, sprite] of this.remoteHeroes) {
      if (visibleHeroIds.has(id)) continue;
      sprite.destroy();
      this.remoteHeroes.delete(id);
      this.remoteBuffers.delete(id);
    }
    for (const unit of snapshot.units) this.upsertUnit(unit);
    const visibleUnitIds = new Set(snapshot.units.map((unit) => unit.id));
    for (const [id, view] of this.units) {
      if (visibleUnitIds.has(id)) continue;
      view.sprite.destroy();
      this.units.delete(id);
      this.selectedIds.delete(id);
    }
    for (const building of snapshot.buildings) this.upsertBuilding(building);
    const visibleBuildingIds = new Set(snapshot.buildings.map((building) => building.id));
    for (const [id, view] of this.buildings) {
      if (visibleBuildingIds.has(id)) continue;
      view.sprite.destroy();
      this.buildings.delete(id);
      if (this.selectedBuildingId === id) this.selectedBuildingId = null;
    }
    for (const node of snapshot.resourceNodes) this.upsertResourceNode(node);
    this.updateProjectiles(snapshot.projectiles);
    this.drawFog(snapshot);
    this.drawMinimap(snapshot);
    this.combatText?.setText(
      snapshot.combatLog
        .slice(-5)
        .reverse()
        .map((entry) => `[${LOG_KIND_NAMES[entry.kind]}] ${entry.text}`)
    );
    const selectedBuilding = this.selectedBuildingId
      ? snapshot.buildings.find((building) => building.id === this.selectedBuildingId)
      : undefined;
    const resources = snapshot.economy.resources;
    this.economyText
      ?.setText(
        `VÀNG ${Math.floor(resources.gold)}  GỖ ${Math.floor(resources.wood)}  LƯƠNG ${Math.floor(resources.food)}  |  QUÂN SỐ ${snapshot.economy.supplyUsed}/${snapshot.economy.supplyCap}  |  ${FORMATION_NAMES[this.formationPreset].toUpperCase()}${selectedBuilding ? `  |  ${BUILDING_NAMES[selectedBuilding.kind].toUpperCase()} HÀNG ĐỢI:${selectedBuilding.queue.length}` : ""}`
      )
      .setX(this.scale.width / 2);
    const seconds = Math.max(
      0,
      Math.ceil(((snapshot.match.countdownEndsAt ?? 0) - Date.now()) / 1000)
    );
    const elapsedSeconds = Math.floor(snapshot.match.elapsedMs / 1000);
    const clock = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
    const objective =
      snapshot.match.phase === "waiting"
        ? "ĐANG CHỜ ĐỐI THỦ"
        : snapshot.match.phase === "countdown"
          ? `TRẬN ĐẤU BẮT ĐẦU SAU ${seconds}`
          : snapshot.match.phase === "paused"
            ? "TẠM DỪNG - ĐANG CHỜ KẾT NỐI LẠI"
            : snapshot.match.phase === "finished"
              ? "TRẬN ĐẤU ĐÃ KẾT THÚC"
              : `${clock}  |  PHÁ HỦY NHÀ CHÍNH ĐỐI PHƯƠNG`;
    this.objectiveText?.setText(objective).setX(this.scale.width / 2);
    if (snapshot.winnerId) {
      this.winnerText
        ?.setText(
          [
            snapshot.winnerId === this.playerId ? "CHIẾN THẮNG" : "THẤT BẠI",
            `Sát thương ${snapshot.stats.damageDealt}  Quân tạo/mất ${snapshot.stats.unitsProduced}/${snapshot.stats.unitsLost}`,
            `Thu thập ${snapshot.stats.resourcesGathered.gold} vàng · ${snapshot.stats.resourcesGathered.wood} gỗ · ${snapshot.stats.resourcesGathered.food} lương`,
            `Công trình xây ${snapshot.stats.buildingsBuilt} · phá hủy ${snapshot.stats.buildingsDestroyed}`
          ].join("\n")
        )
        .setVisible(true)
        .setX(this.scale.width / 2);
    }
    this.statusCallback(
      "online",
      snapshot.roomPlayerCount < 2 ? "Đang chờ đối thủ" : "Chiến trường đã đồng bộ",
      snapshot.roomPlayerCount
    );
  }

  private updateProjectiles(projectiles: ProjectileState[]) {
    const visibleIds = new Set(projectiles.map((projectile) => projectile.id));
    for (const projectile of projectiles) {
      let sprite = this.projectiles.get(projectile.id);
      if (!sprite) {
        sprite = this.add
          .circle(projectile.position.x, projectile.position.y, 4, 0xffd166)
          .setDepth(10);
        this.projectiles.set(projectile.id, sprite);
      }
      sprite.setPosition(projectile.position.x, projectile.position.y);
    }
    for (const [id, sprite] of this.projectiles) {
      if (visibleIds.has(id)) continue;
      sprite.destroy();
      this.projectiles.delete(id);
    }
  }

  private drawFog(snapshot: GameSnapshot) {
    if (!this.fogGraphics) return;
    const visible = new Set(snapshot.vision.visibleCells);
    const explored = new Set(snapshot.vision.exploredCells);
    const columns = Math.ceil(MAP_SIZE.width / snapshot.vision.cellSize);
    const rows = Math.ceil(MAP_SIZE.height / snapshot.vision.cellSize);
    this.fogGraphics.clear();
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const cell = `${x},${y}`;
        if (visible.has(cell)) continue;
        this.fogGraphics
          .fillStyle(0x020605, explored.has(cell) ? 0.58 : 0.94)
          .fillRect(
            x * snapshot.vision.cellSize,
            y * snapshot.vision.cellSize,
            snapshot.vision.cellSize + 1,
            snapshot.vision.cellSize + 1
          );
      }
    }
  }

  private drawMinimap(snapshot: GameSnapshot) {
    if (!this.minimapGraphics) return;
    const width = 168;
    const height = 112;
    const x = this.scale.width - width - 16;
    const y = 16;
    const scaleX = width / MAP_SIZE.width;
    const scaleY = height / MAP_SIZE.height;
    const visible = new Set(snapshot.vision.visibleCells);
    const explored = new Set(snapshot.vision.exploredCells);
    const columns = Math.ceil(MAP_SIZE.width / snapshot.vision.cellSize);
    const rows = Math.ceil(MAP_SIZE.height / snapshot.vision.cellSize);
    this.minimapGraphics.clear().fillStyle(0x020605, 0.95).fillRect(x, y, width, height);
    for (let cellY = 0; cellY < rows; cellY += 1) {
      for (let cellX = 0; cellX < columns; cellX += 1) {
        const cell = `${cellX},${cellY}`;
        if (!explored.has(cell)) continue;
        this.minimapGraphics
          .fillStyle(visible.has(cell) ? 0x285d4e : 0x152a24, 1)
          .fillRect(
            x + cellX * snapshot.vision.cellSize * scaleX,
            y + cellY * snapshot.vision.cellSize * scaleY,
            snapshot.vision.cellSize * scaleX + 0.5,
            snapshot.vision.cellSize * scaleY + 0.5
          );
      }
    }
    for (const hero of snapshot.heroes) {
      this.minimapGraphics
        .fillStyle(hero.id === this.playerId ? gameColors.local : gameColors.remote)
        .fillCircle(x + hero.position.x * scaleX, y + hero.position.y * scaleY, 3);
    }
    for (const unit of snapshot.units) {
      this.minimapGraphics
        .fillStyle(unit.ownerId === this.playerId ? gameColors.local : gameColors.remote)
        .fillCircle(x + unit.position.x * scaleX, y + unit.position.y * scaleY, 1.4);
    }
    for (const node of snapshot.resourceNodes) {
      if (node.remaining <= 0) continue;
      this.minimapGraphics
        .fillStyle(node.kind === "gold" ? 0xd5a93f : node.kind === "wood" ? 0x4c8b5f : 0xc8785c)
        .fillCircle(x + node.position.x * scaleX, y + node.position.y * scaleY, 1.6);
    }
    for (const building of snapshot.buildings) {
      this.minimapGraphics
        .fillStyle(building.ownerId === this.playerId ? gameColors.local : gameColors.remote)
        .fillRect(x + building.position.x * scaleX - 2, y + building.position.y * scaleY - 2, 4, 4);
    }
    this.minimapGraphics.lineStyle(1, 0x8aaea3).strokeRect(x, y, width, height);
  }

  private updateRemoteHeroes(time: number) {
    const renderTime = time - 110;
    for (const [id, buffer] of this.remoteBuffers) {
      let sprite = this.remoteHeroes.get(id);
      if (!sprite) {
        sprite = this.physics.add
          .sprite(buffer[0]?.state.position.x ?? 0, buffer[0]?.state.position.y ?? 0, "hero-remote")
          .setDepth(8);
        this.remoteHeroes.set(id, sprite);
      }
      const newerIndex = buffer.findIndex((entry) => entry.receivedAt >= renderTime);
      const newer = buffer[Math.max(0, newerIndex)];
      const older = buffer[Math.max(0, newerIndex < 0 ? buffer.length - 1 : newerIndex - 1)];
      if (!older || !newer) continue;
      const span = Math.max(1, newer.receivedAt - older.receivedAt);
      const alpha = Phaser.Math.Clamp((renderTime - older.receivedAt) / span, 0, 1);
      sprite.setPosition(
        Phaser.Math.Linear(older.state.position.x, newer.state.position.x, alpha),
        Phaser.Math.Linear(older.state.position.y, newer.state.position.y, alpha)
      );
      sprite.rotation = newer.state.rotation;
    }
  }

  private upsertUnit(state: UnitState) {
    let view = this.units.get(state.id);
    if (!view) {
      const local = state.ownerId === this.playerId;
      const sprite = this.add
        .circle(
          state.position.x,
          state.position.y,
          state.kind === "cavalry" || state.kind === "guardian" ? 13 : 11,
          local ? UNIT_COLORS[state.kind] : gameColors.remote,
          0.95
        )
        .setDepth(7);
      sprite.setStrokeStyle(2, 0x0b201c, 0.9);
      view = { state, sprite, path: [] };
      this.units.set(state.id, view);
    }
    view.state = state;
    if (view.path.length === 0) view.sprite.setPosition(state.position.x, state.position.y);
    this.refreshSelectionStyle(view);
  }

  private upsertBuilding(state: BuildingState) {
    let view = this.buildings.get(state.id);
    if (!view) {
      const preview = BUILDING_PREVIEWS[state.kind];
      const sprite = this.add
        .rectangle(
          state.position.x,
          state.position.y,
          state.width,
          state.height,
          preview.color,
          0.92
        )
        .setDepth(6);
      view = { state, sprite };
      this.buildings.set(state.id, view);
    }
    view.state = state;
    view.sprite.setPosition(state.position.x, state.position.y);
    view.sprite.setStrokeStyle(
      this.selectedBuildingId === state.id ? 4 : 2,
      state.ownerId === this.playerId ? gameColors.local : gameColors.remote,
      1
    );
  }

  private upsertResourceNode(state: ResourceNodeState) {
    let sprite = this.resourceNodes.get(state.id);
    if (!sprite) {
      const colors = { gold: 0xd5a93f, wood: 0x4c8b5f, food: 0xc8785c } as const;
      sprite = this.add
        .circle(state.position.x, state.position.y, 22, colors[state.kind], 0.9)
        .setDepth(4);
      sprite.setStrokeStyle(3, 0xe8f3ef, 0.45);
      this.resourceNodes.set(state.id, sprite);
    }
    sprite.setAlpha(state.remaining > 0 ? 0.9 : 0.22);
  }

  private updateUnits(delta: number) {
    for (const view of this.units.values()) {
      const target = view.path[0];
      if (!target) continue;
      const distance = Phaser.Math.Distance.Between(
        view.sprite.x,
        view.sprite.y,
        target.x,
        target.y
      );
      if (distance < 4) {
        view.sprite.setPosition(target.x, target.y);
        view.path.shift();
        continue;
      }
      const step = Math.min(distance, 125 * delta);
      view.sprite.x += ((target.x - view.sprite.x) / distance) * step;
      view.sprite.y += ((target.y - view.sprite.y) / distance) * step;
    }
  }

  private pointerDown(pointer: Phaser.Input.Pointer) {
    if (pointer.middleButtonDown()) {
      this.panAnchor = new Phaser.Math.Vector2(pointer.x, pointer.y);
      return;
    }
    if (pointer.rightButtonDown()) {
      const targetId = this.findEnemyAt({ x: pointer.worldX, y: pointer.worldY });
      if (targetId) this.issueAttack(targetId);
      else if (this.selectedIds.size > 0) this.issueMove({ x: pointer.worldX, y: pointer.worldY });
      else if (this.selectedBuildingId)
        this.network?.send({
          type: "set-rally",
          buildingId: this.selectedBuildingId,
          position: { x: pointer.worldX, y: pointer.worldY }
        });
      return;
    }
    if (pointer.leftButtonDown() && this.pendingBuilding) {
      this.network?.send({
        type: "place-building",
        buildingKind: this.pendingBuilding,
        position: { x: pointer.worldX, y: pointer.worldY }
      });
      this.pendingBuilding = null;
      this.placementGraphics?.clear();
      return;
    }
    if (pointer.leftButtonDown()) {
      const ownedBuilding = [...this.buildings.values()].find(
        (view) =>
          view.state.ownerId === this.playerId &&
          Phaser.Geom.Rectangle.Contains(
            new Phaser.Geom.Rectangle(
              view.state.position.x - view.state.width / 2,
              view.state.position.y - view.state.height / 2,
              view.state.width,
              view.state.height
            ),
            pointer.worldX,
            pointer.worldY
          )
      );
      if (ownedBuilding) {
        this.selectedBuildingId = ownedBuilding.state.id;
        this.selectedIds.clear();
        this.refreshBuildingStyles();
        this.refreshAllSelectionStyles();
        return;
      }
      this.selectedBuildingId = null;
      this.refreshBuildingStyles();
      this.selectionStart = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    }
  }

  private pointerMove(pointer: Phaser.Input.Pointer) {
    if (this.pendingBuilding && this.placementGraphics) {
      const preview = BUILDING_PREVIEWS[this.pendingBuilding];
      const inBounds =
        pointer.worldX - preview.width / 2 > 0 &&
        pointer.worldY - preview.height / 2 > 0 &&
        pointer.worldX + preview.width / 2 < MAP_SIZE.width &&
        pointer.worldY + preview.height / 2 < MAP_SIZE.height;
      this.placementGraphics
        .clear()
        .fillStyle(inBounds ? 0x38d6b1 : 0xf0705a, 0.3)
        .fillRect(
          pointer.worldX - preview.width / 2,
          pointer.worldY - preview.height / 2,
          preview.width,
          preview.height
        );
      this.placementGraphics
        .lineStyle(2, inBounds ? 0x38d6b1 : 0xf0705a, 0.9)
        .strokeRect(
          pointer.worldX - preview.width / 2,
          pointer.worldY - preview.height / 2,
          preview.width,
          preview.height
        );
    }
    if (this.panAnchor && pointer.middleButtonDown()) {
      const camera = this.cameras.main;
      camera.followOffset.x += (pointer.x - this.panAnchor.x) / camera.zoom;
      camera.followOffset.y += (pointer.y - this.panAnchor.y) / camera.zoom;
      this.panAnchor.set(pointer.x, pointer.y);
    }
    if (!this.selectionStart || !pointer.leftButtonDown() || !this.selectionGraphics) return;
    const x = Math.min(this.selectionStart.x, pointer.worldX);
    const y = Math.min(this.selectionStart.y, pointer.worldY);
    this.selectionGraphics
      .clear()
      .fillStyle(gameColors.selected, 0.1)
      .fillRect(
        x,
        y,
        Math.abs(pointer.worldX - this.selectionStart.x),
        Math.abs(pointer.worldY - this.selectionStart.y)
      );
    this.selectionGraphics
      .lineStyle(1, gameColors.selected, 0.9)
      .strokeRect(
        x,
        y,
        Math.abs(pointer.worldX - this.selectionStart.x),
        Math.abs(pointer.worldY - this.selectionStart.y)
      );
  }

  private pointerUp(pointer: Phaser.Input.Pointer) {
    if (pointer.button === 1) this.panAnchor = undefined;
    if (pointer.button !== 0 || !this.selectionStart) return;
    const bounds = new Phaser.Geom.Rectangle(
      Math.min(this.selectionStart.x, pointer.worldX),
      Math.min(this.selectionStart.y, pointer.worldY),
      Math.max(8, Math.abs(pointer.worldX - this.selectionStart.x)),
      Math.max(8, Math.abs(pointer.worldY - this.selectionStart.y))
    );
    const additive = pointer.event.shiftKey;
    if (!additive) this.selectedIds.clear();
    const localUnits = [...this.units.values()].filter(
      (unit) => unit.state.ownerId === this.playerId
    );
    if (bounds.width <= 10 && bounds.height <= 10) {
      const closest = localUnits
        .filter(
          (unit) =>
            Phaser.Math.Distance.Between(
              pointer.worldX,
              pointer.worldY,
              unit.sprite.x,
              unit.sprite.y
            ) <= 18
        )
        .sort(
          (a, b) =>
            Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, a.sprite.x, a.sprite.y) -
            Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, b.sprite.x, b.sprite.y)
        )[0];
      if (closest) this.selectedIds.add(closest.state.id);
    } else {
      for (const unit of localUnits)
        if (bounds.contains(unit.sprite.x, unit.sprite.y)) this.selectedIds.add(unit.state.id);
    }
    this.selectionStart = undefined;
    this.selectionGraphics?.clear();
    this.refreshAllSelectionStyles();
  }

  private issueMove(destination: Vector2, order: "move" | "retreat" = "move") {
    const selected = [...this.selectedIds]
      .map((id) => this.units.get(id))
      .filter((unit): unit is UnitView => Boolean(unit));
    const slots = createFormation(destination, selected.length, 38, this.formationPreset);
    selected.forEach((unit, index) => {
      unit.path = findPath({ x: unit.sprite.x, y: unit.sprite.y }, slots[index] ?? destination);
      unit.state.order = order;
    });
    this.network?.send({
      type: "unit-command",
      unitIds: selected.map((unit) => unit.state.id),
      order,
      destinations: slots
    });
    this.network?.send({
      type: "set-formation",
      unitIds: selected.map((unit) => unit.state.id),
      formation: this.formationPreset
    });
  }

  private issueAttack(targetId: string) {
    const attackerIds = [...this.selectedIds];
    if (attackerIds.length > 0) {
      this.network?.send({ type: "attack", attackerIds, targetId });
      return;
    }
    const target = this.targetPosition(targetId);
    if (target)
      this.network?.send({
        type: "hero-ability",
        ability: "basic",
        target,
        targetId
      });
  }

  private findEnemyAt(position: Vector2) {
    const building = [...this.buildings.values()].find(
      (view) =>
        view.state.ownerId !== this.playerId &&
        Math.abs(position.x - view.state.position.x) <= view.state.width / 2 &&
        Math.abs(position.y - view.state.position.y) <= view.state.height / 2
    );
    if (building) return building.state.id;
    const unit = [...this.units.values()]
      .filter((view) => view.state.ownerId !== this.playerId)
      .sort(
        (left, right) =>
          Phaser.Math.Distance.Between(position.x, position.y, left.sprite.x, left.sprite.y) -
          Phaser.Math.Distance.Between(position.x, position.y, right.sprite.x, right.sprite.y)
      )[0];
    if (
      unit &&
      Phaser.Math.Distance.Between(position.x, position.y, unit.sprite.x, unit.sprite.y) <= 24
    )
      return unit.state.id;
    const hero = [...this.remoteHeroes.entries()].find(
      ([, sprite]) => Phaser.Math.Distance.Between(position.x, position.y, sprite.x, sprite.y) <= 30
    );
    return hero?.[0];
  }

  private targetPosition(targetId: string): Vector2 | undefined {
    const building = this.buildings.get(targetId)?.state;
    if (building) return building.position;
    const unit = this.units.get(targetId)?.sprite;
    if (unit) return { x: unit.x, y: unit.y };
    const hero = this.remoteHeroes.get(targetId);
    return hero ? { x: hero.x, y: hero.y } : undefined;
  }

  private handleCommandKey(event: KeyboardEvent) {
    const buildingKeys: Partial<Record<string, BuildingKind>> = {
      F1: "headquarters",
      F2: "barracks",
      F3: "archery-range",
      F4: "storehouse",
      F5: "watchtower"
    };
    const building = buildingKeys[event.code];
    if (building) {
      this.pendingBuilding = building;
      event.preventDefault();
      return;
    }
    if (event.code === "Escape") {
      this.pendingBuilding = null;
      this.placementGraphics?.clear();
      return;
    }
    const number = Number.parseInt(event.key, 10);
    if (number >= 1 && number <= 5) {
      if (event.ctrlKey) this.controlGroups.set(number, [...this.selectedIds]);
      else {
        this.selectedIds = new Set(
          (this.controlGroups.get(number) ?? []).filter((id) => this.units.has(id))
        );
        this.refreshAllSelectionStyles();
      }
      event.preventDefault();
      return;
    }
    if (event.code === "Space") {
      this.cameras.main.followOffset.set(0, 0);
      event.preventDefault();
      return;
    }
    if (event.repeat || event.ctrlKey || event.metaKey) return;
    const productionKeys: Partial<Record<string, UnitKind>> = {
      J: "swordsman",
      K: "spearman",
      L: "archer",
      N: "cavalry",
      M: "skirmisher",
      P: "guardian"
    };
    const production = productionKeys[event.key.toUpperCase()];
    if (production) this.queueUnit(production);
    if (event.key.toUpperCase() === "Z") {
      const presets: FormationPreset[] = ["line", "wedge", "box", "spread"];
      const current = presets.indexOf(this.formationPreset);
      this.formationPreset = presets[(current + 1) % presets.length] ?? "box";
      this.network?.send({
        type: "set-formation",
        unitIds: [...this.selectedIds],
        formation: this.formationPreset
      });
    }
    if (event.key.toUpperCase() === "O") this.network?.send({ type: "surrender" });
    if (event.key.toUpperCase() === keybinds.hold) this.issueOrder("hold");
    if (event.key.toUpperCase() === keybinds.stop) this.issueOrder("stop");
    if (event.key.toUpperCase() === keybinds.retreat) {
      const heroPosition = { x: this.localHero?.x ?? 250, y: this.localHero?.y ?? 260 };
      this.issueMove(heroPosition, "retreat");
    }
    const pointer = this.input.activePointer;
    const target = { x: pointer.worldX, y: pointer.worldY };
    if (event.key.toUpperCase() === keybinds.basicAttack) {
      const targetId = this.findEnemyAt(target);
      if (targetId) {
        this.issueAttack(targetId);
        this.playInterfaceTone(180);
      }
    }
    if (event.key.toUpperCase() === keybinds.shockwave) {
      this.network?.send({ type: "hero-ability", ability: "shockwave", target });
      this.playInterfaceTone(110);
    }
    if (event.key.toUpperCase() === keybinds.piercingShot) {
      this.network?.send({ type: "hero-ability", ability: "piercing-shot", target });
      this.playInterfaceTone(310);
    }
    if (event.key.toUpperCase() === keybinds.scout) {
      this.network?.send({ type: "hero-ability", ability: "scout", target });
      this.playInterfaceTone(440);
    }
  }

  private userSettings() {
    try {
      return JSON.parse(localStorage.getItem("aetherion-settings") ?? "{}") as {
        sound?: boolean;
        effects?: boolean;
      };
    } catch {
      return {};
    }
  }

  private playInterfaceTone(frequency: number) {
    if (this.userSettings().sound === false) return;
    this.audioContext ??= new AudioContext();
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.12);
    oscillator.connect(gain).connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.12);
  }

  private createCombatEffect(kind: "hit" | "death") {
    if (this.userSettings().effects === false || !this.localHero) return;
    const effect = this.add
      .circle(
        this.localHero.x,
        this.localHero.y,
        kind === "death" ? 34 : 22,
        kind === "death" ? 0xf0705a : 0xffd166,
        0.28
      )
      .setDepth(12);
    this.tweens.add({
      targets: effect,
      alpha: 0,
      scale: kind === "death" ? 2.4 : 1.7,
      duration: kind === "death" ? 420 : 220,
      onComplete: () => effect.destroy()
    });
  }

  private queueUnit(unitKind: UnitKind) {
    const accepts = (building: BuildingState) =>
      building.kind === "barracks"
        ? ["swordsman", "spearman", "cavalry", "guardian"].includes(unitKind)
        : building.kind === "archery-range" && ["archer", "skirmisher"].includes(unitKind);
    const selected = this.selectedBuildingId
      ? this.buildings.get(this.selectedBuildingId)?.state
      : undefined;
    const producer =
      selected && accepts(selected)
        ? selected
        : [...this.buildings.values()]
            .map((view) => view.state)
            .find((building) => building.ownerId === this.playerId && accepts(building));
    if (!producer) return;
    this.selectedBuildingId = producer.id;
    this.refreshBuildingStyles();
    this.network?.send({
      type: "queue-production",
      buildingId: producer.id,
      unitKind
    });
  }

  private issueOrder(order: UnitOrder) {
    const ids = [...this.selectedIds];
    for (const id of ids) {
      const unit = this.units.get(id);
      if (unit) unit.path = [];
    }
    this.network?.send({ type: "unit-command", unitIds: ids, order });
  }

  private refreshAllSelectionStyles() {
    for (const unit of this.units.values()) this.refreshSelectionStyle(unit);
  }

  private refreshBuildingStyles() {
    for (const building of this.buildings.values())
      building.sprite.setStrokeStyle(
        this.selectedBuildingId === building.state.id ? 4 : 2,
        building.state.ownerId === this.playerId ? gameColors.local : gameColors.remote,
        1
      );
  }

  private refreshSelectionStyle(unit: UnitView) {
    unit.sprite.setStrokeStyle(
      this.selectedIds.has(unit.state.id) ? 3 : 2,
      this.selectedIds.has(unit.state.id) ? gameColors.selected : 0x0b201c,
      1
    );
  }

  private drawHealthBars() {
    if (!this.healthGraphics) return;
    this.healthGraphics.clear();
    for (const unit of this.units.values()) {
      const ratio = Phaser.Math.Clamp(unit.state.hp / unit.state.maxHp, 0, 1);
      this.healthGraphics
        .fillStyle(0x07110e, 0.9)
        .fillRect(unit.sprite.x - 12, unit.sprite.y - 18, 24, 3);
      this.healthGraphics
        .fillStyle(unit.state.ownerId === this.playerId ? 0x38d6b1 : 0xf0705a, 1)
        .fillRect(unit.sprite.x - 12, unit.sprite.y - 18, 24 * ratio, 3);
      this.healthGraphics
        .fillStyle(unit.state.panicked ? 0xf0705a : 0x69a6e8, 0.9)
        .fillRect(unit.sprite.x - 12, unit.sprite.y - 14, 24 * (unit.state.morale / 100), 2);
    }
    if (this.localHero && this.localHeroState) {
      const ratio = this.localHeroState.hp / this.localHeroState.maxHp;
      this.healthGraphics
        .fillStyle(0x07110e, 0.95)
        .fillRect(this.localHero.x - 24, this.localHero.y - 32, 48, 5);
      this.healthGraphics
        .fillStyle(0x38d6b1, 1)
        .fillRect(this.localHero.x - 24, this.localHero.y - 32, 48 * ratio, 5);
    }
    for (const [id, sprite] of this.remoteHeroes) {
      const state = this.remoteBuffers.get(id)?.at(-1)?.state;
      if (!state) continue;
      this.healthGraphics.fillStyle(0x07110e, 0.95).fillRect(sprite.x - 24, sprite.y - 32, 48, 5);
      this.healthGraphics
        .fillStyle(0xf0705a, 1)
        .fillRect(sprite.x - 24, sprite.y - 32, 48 * (state.hp / state.maxHp), 5);
    }
    for (const building of this.buildings.values()) {
      const width = Math.min(70, building.state.width * 0.7);
      const ratio = building.state.hp / building.state.maxHp;
      const y = building.sprite.y - building.state.height / 2 - 10;
      this.healthGraphics
        .fillStyle(0x07110e, 0.95)
        .fillRect(building.sprite.x - width / 2, y, width, 5);
      this.healthGraphics
        .fillStyle(
          building.state.ownerId === this.playerId ? gameColors.local : gameColors.remote,
          1
        )
        .fillRect(building.sprite.x - width / 2, y, width * ratio, 5);
    }
  }

  private updateDebug() {
    if (!this.debugText || !this.localHero) return;
    const body = this.localHero.body as Phaser.Physics.Arcade.Body;
    this.debugText.setText([
      `FPS ${Math.round(this.game.loop.actualFps)}  |  PHÒNG ${this.roomCode}`,
      `VỊ TRÍ ${Math.round(this.localHero.x)}, ${Math.round(this.localHero.y)}`,
      `VẬN TỐC ${Math.round(body.velocity.x)}, ${Math.round(body.velocity.y)}  |  ${this.activeAnimation === "idle" ? "ĐỨNG YÊN" : this.activeAnimation === "run" ? "CHẠY" : "LƯỚT"}`,
      `SINH LỰC ${this.localHeroState?.hp ?? 0}/${this.localHeroState?.maxHp ?? 0}`,
      `QUÂN NHÌN THẤY ${this.units.size}  |  ĐÃ CHỌN ${this.selectedIds.size}`
    ]);
  }
}

import {
  type FormationPreset,
  type PlayerResources,
  type UnitKind,
  type Vector2
} from "@aetherion/shared-types";

interface UnitBlueprint {
  hp: number;
  armor: number;
  damage: number;
  range: number;
  vision: number;
  cooldown: number;
  speed: number;
  supply: number;
  trainMs: number;
  cost: PlayerResources;
}

export const UNIT_BLUEPRINTS: Record<UnitKind, UnitBlueprint> = {
  swordsman: {
    hp: 120,
    armor: 20,
    damage: 22,
    range: 42,
    vision: 300,
    cooldown: 820,
    speed: 125,
    supply: 1,
    trainMs: 3400,
    cost: { gold: 70, wood: 0, food: 55 }
  },
  spearman: {
    hp: 110,
    armor: 18,
    damage: 18,
    range: 58,
    vision: 310,
    cooldown: 900,
    speed: 118,
    supply: 1,
    trainMs: 3600,
    cost: { gold: 60, wood: 35, food: 50 }
  },
  archer: {
    hp: 75,
    armor: 8,
    damage: 24,
    range: 360,
    vision: 360,
    cooldown: 1200,
    speed: 120,
    supply: 1,
    trainMs: 3900,
    cost: { gold: 65, wood: 55, food: 40 }
  },
  cavalry: {
    hp: 165,
    armor: 24,
    damage: 30,
    range: 48,
    vision: 360,
    cooldown: 1050,
    speed: 175,
    supply: 2,
    trainMs: 6200,
    cost: { gold: 140, wood: 0, food: 110 }
  },
  skirmisher: {
    hp: 85,
    armor: 10,
    damage: 17,
    range: 245,
    vision: 390,
    cooldown: 760,
    speed: 145,
    supply: 1,
    trainMs: 4200,
    cost: { gold: 55, wood: 40, food: 55 }
  },
  guardian: {
    hp: 210,
    armor: 42,
    damage: 16,
    range: 44,
    vision: 280,
    cooldown: 1100,
    speed: 92,
    supply: 2,
    trainMs: 5800,
    cost: { gold: 110, wood: 65, food: 85 }
  }
};

const COUNTERS: Partial<Record<UnitKind, Partial<Record<UnitKind, number>>>> = {
  swordsman: { archer: 1.3, skirmisher: 1.2 },
  spearman: { cavalry: 1.85, guardian: 1.15 },
  archer: { spearman: 1.3, guardian: 0.72 },
  cavalry: { archer: 1.65, skirmisher: 1.5, spearman: 0.55 },
  skirmisher: { spearman: 1.35, guardian: 1.25, cavalry: 0.75 },
  guardian: { swordsman: 1.35, archer: 1.15, cavalry: 0.8 }
};

export const counterModifier = (attacker: UnitKind, defender: UnitKind) =>
  COUNTERS[attacker]?.[defender] ?? 1;

export const facingModifier = (attacker: Vector2, defender: Vector2, defenderFacing: number) => {
  const incoming = Math.atan2(attacker.y - defender.y, attacker.x - defender.x);
  const difference = Math.abs(
    Math.atan2(Math.sin(incoming - defenderFacing), Math.cos(incoming - defenderFacing))
  );
  if (difference > Math.PI * 0.72) return { modifier: 1.4, reason: "đánh sau lưng" };
  if (difference > Math.PI * 0.38) return { modifier: 1.2, reason: "đánh sườn" };
  return { modifier: 1, reason: "chính diện" };
};

export const formationDamageModifier = (
  formation: FormationPreset,
  attackerKind: UnitKind,
  ranged: boolean
) => {
  if (formation === "wedge" && attackerKind === "cavalry") return 1.15;
  if (formation === "line" && ranged) return 1.12;
  return 1;
};

export const formationDefenseModifier = (formation: FormationPreset, ranged: boolean) => {
  if (formation === "box" && ranged) return 0.82;
  if (formation === "spread" && ranged) return 0.88;
  return 1;
};

export const moraleAfterEvent = (
  current: number,
  event: "ally-death" | "flanked" | "hq-lost" | "recover"
) => {
  const changes = { "ally-death": -12, flanked: -7, "hq-lost": -35, recover: 2 } as const;
  return Math.max(0, Math.min(100, current + changes[event]));
};

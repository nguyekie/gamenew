export const keybinds = {
  up: "W",
  down: "S",
  left: "A",
  right: "D",
  dash: "SHIFT",
  hold: "H",
  stop: "X",
  retreat: "R",
  basicAttack: "F",
  shockwave: "Q",
  piercingShot: "E",
  scout: "C"
} as const;

export const gameColors = {
  ground: 0x173f35,
  groundAlternate: 0x1c4a3e,
  grid: 0x35685a,
  obstacle: 0x5b4b3e,
  obstacleEdge: 0xa08563,
  local: 0x38d6b1,
  remote: 0xf0705a,
  selected: 0xffd166
} as const;

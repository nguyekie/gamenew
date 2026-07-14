import WebSocket from "ws";

const clients = [];
const roomCode = `QA${Date.now().toString(36).slice(-6)}`.toUpperCase();

const join = (label) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket("ws://localhost:3001/realtime");
    clients.push(socket);
    const timer = setTimeout(() => reject(new Error(`${label} join timeout`)), 6000);
    socket.on("open", () => socket.send(JSON.stringify({ type: "join", roomCode })));
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "error") console.error(`${label}: ${message.message}`);
      if (message.type !== "joined") return;
      clearTimeout(timer);
      resolve({ socket, id: message.playerId });
    });
    socket.on("error", reject);
  });

const waitForSnapshot = (socket, predicate, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), 6000);
    const receive = (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type !== "snapshot" || !predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", receive);
      resolve(message);
    };
    socket.on("message", receive);
  });

try {
  const [first, second] = await Promise.all([join("first player"), join("second player")]);
  const snapshot = await waitForSnapshot(
    first.socket,
    (message) => message.roomPlayerCount === 2,
    "filtered two-player snapshot"
  );
  if (snapshot.heroes.some((hero) => hero.id === second.id))
    throw new Error("Hidden enemy hero leaked into snapshot");
  if (snapshot.units.some((unit) => unit.ownerId === second.id))
    throw new Error("Hidden enemy units leaked into snapshot");
  if (new Set(snapshot.units.map((unit) => unit.kind)).size !== 6)
    throw new Error("Expected all six tactical unit types");
  if (snapshot.buildings.some((building) => building.ownerId === second.id))
    throw new Error("Hidden enemy buildings leaked into snapshot");
  const remoteUnitId = `${second.id}-unit-0`;

  first.socket.send(
    JSON.stringify({
      type: "unit-command",
      unitIds: [remoteUnitId],
      order: "move",
      destinations: [{ x: 999, y: 999 }]
    })
  );
  const verified = await waitForSnapshot(
    second.socket,
    (message) => message.units.find((unit) => unit.id === remoteUnitId)?.destination === null,
    "ownership validation"
  );

  await waitForSnapshot(
    first.socket,
    (message) => message.match.phase === "active",
    "match countdown"
  );
  const ownHero = snapshot.heroes.find((hero) => hero.id === first.id);
  if (!ownHero) throw new Error("Local hero missing from filtered snapshot");
  const buildPosition = {
    x: ownHero.position.x + (ownHero.position.x < 1200 ? 170 : -170),
    y: ownHero.position.y - 10
  };
  first.socket.send(
    JSON.stringify({
      type: "place-building",
      buildingKind: "barracks",
      position: buildPosition
    })
  );
  const built = await waitForSnapshot(
    first.socket,
    (message) => message.buildings.some((building) => building.kind === "barracks"),
    "building placement"
  );
  const barracks = built.buildings.find((building) => building.kind === "barracks");
  if (!barracks) throw new Error("Barracks missing after placement");
  first.socket.send(
    JSON.stringify({
      type: "queue-production",
      buildingId: barracks.id,
      unitKind: "swordsman"
    })
  );
  await waitForSnapshot(
    first.socket,
    (message) =>
      message.buildings.find((building) => building.id === barracks.id)?.queue.length === 1,
    "production queue"
  );
  first.socket.send(JSON.stringify({ type: "surrender" }));
  const finished = await waitForSnapshot(
    second.socket,
    (message) => message.match.phase === "finished" && message.winnerId === second.id,
    "surrender victory"
  );
  console.log(
    JSON.stringify({
      room: finished.roomCode,
      players: finished.roomPlayerCount,
      units: verified.units.length,
      ownershipRejected: true,
      hiddenEnemyFiltered: true,
      sixUnitTypes: true,
      productionQueueSynced: true,
      victoryReason: "surrender"
    })
  );
} finally {
  for (const client of clients) client.close();
}

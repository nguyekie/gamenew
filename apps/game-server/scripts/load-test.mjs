import WebSocket from "ws";

const roomCount = Number.parseInt(process.env.ROOMS ?? "20", 10);
const timeoutMs = Number.parseInt(process.env.TIMEOUT_MS ?? "12000", 10);
const sockets = [];
const startedAt = performance.now();

const connect = (roomCode) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket("ws://localhost:3001/realtime");
    sockets.push(socket);
    const timer = setTimeout(
      () => reject(new Error(`Phòng ${roomCode} quá hạn kết nối`)),
      timeoutMs
    );
    socket.on("open", () => socket.send(JSON.stringify({ type: "join", roomCode })));
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type !== "snapshot" || message.roomPlayerCount !== 2) return;
      clearTimeout(timer);
      resolve();
    });
    socket.on("error", reject);
  });

try {
  const joins = [];
  for (let room = 0; room < roomCount; room += 1) {
    const code = `TAI${room.toString(36).padStart(3, "0")}`.toUpperCase();
    joins.push(connect(code), connect(code));
  }
  await Promise.all(joins);
  console.log(
    JSON.stringify({
      ketQua: "đạt",
      soPhong: roomCount,
      soKetNoi: sockets.length,
      thoiGianMs: Math.round(performance.now() - startedAt)
    })
  );
} finally {
  for (const socket of sockets) socket.close();
}

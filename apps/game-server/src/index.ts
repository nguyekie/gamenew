import { createServer } from "node:http";

import { createHealthResponse } from "@aetherion/shared-types";

import { RealtimeRoomServer } from "./roomServer.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const version = process.env.npm_package_version ?? "0.0.0";

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(createHealthResponse("game-server", version)));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Không tìm thấy đường dẫn" }));
});

server.listen(port, () => {
  console.log(`Máy chủ trận đấu đang chạy tại http://localhost:${port}`);
});

new RealtimeRoomServer(server);

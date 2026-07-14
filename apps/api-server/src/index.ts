import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createHealthResponse } from "@aetherion/shared-types";

import { OperationsService, SlidingWindowRateLimiter } from "./operations.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const version = process.env.npm_package_version ?? "0.0.0";
const operations = new OperationsService();
const limiter = new SlidingWindowRateLimiter(120, 60_000);

const writeJson = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
};

const readJson = async (request: IncomingMessage) => {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 32_768) throw new Error("Dữ liệu gửi lên quá lớn");
  }
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
};

const bearer = (request: IncomingMessage) => request.headers.authorization?.replace(/^Bearer /, "");

const server = createServer(async (request, response) => {
  const startedAt = performance.now();
  const ip = request.socket.remoteAddress ?? "unknown";
  if (request.method === "OPTIONS") return writeJson(response, 204, {});
  if (!limiter.allow(ip))
    return writeJson(response, 429, { error: "Bạn thao tác quá nhanh, vui lòng thử lại sau" });
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/health")
      return writeJson(response, 200, createHealthResponse("api-server", version));
    if (request.method === "POST" && ["/auth/register", "/auth/login"].includes(url.pathname)) {
      const body = await readJson(request);
      const displayName = String(body.displayName ?? "");
      const password = String(body.password ?? "");
      const session =
        url.pathname === "/auth/register"
          ? operations.register(displayName, password)
          : operations.login(displayName, password);
      operations.increment("auth_success_total");
      return writeJson(response, 200, session);
    }
    if (request.method === "POST" && url.pathname === "/telemetry") {
      const body = await readJson(request);
      operations.increment(`telemetry_${String(body.event ?? "unknown")}`);
      if (body.latencyMs !== undefined) operations.recordLatency(Number(body.latencyMs));
      return writeJson(response, 202, { accepted: true });
    }
    const user = operations.authenticate(bearer(request));
    if (request.method === "GET" && url.pathname === "/profile")
      return writeJson(response, 200, operations.profile(user.id));
    if (request.method === "POST" && url.pathname === "/matchmaking/join") {
      const body = await readJson(request);
      return writeJson(
        response,
        200,
        operations.joinQueue(user.id, String(body.region ?? "sea"), Number(body.latencyMs ?? 0))
      );
    }
    if (request.method === "GET" && url.pathname === "/matchmaking/status")
      return writeJson(response, 200, operations.queueStatus(user.id));
    if (request.method === "POST" && url.pathname === "/matchmaking/leave") {
      operations.leaveQueue(user.id);
      return writeJson(response, 200, { ok: true });
    }
    if (request.method === "POST" && url.pathname === "/matches/result") {
      const body = await readJson(request);
      return writeJson(
        response,
        200,
        operations.recordResult(String(body.matchId), String(body.winnerId), String(body.resultId))
      );
    }
    if (request.method === "GET" && url.pathname === "/admin/metrics")
      return writeJson(response, 200, operations.metrics());
    if (request.method === "GET" && url.pathname === "/admin/matches")
      return writeJson(response, 200, operations.listMatches());
    if (request.method === "GET" && url.pathname === "/config/balance")
      return writeJson(response, 200, {
        version: "alpha-1",
        heroDamageMultiplier: 1,
        economyMultiplier: 1,
        targetMatchMinutes: 25
      });
    return writeJson(response, 404, { error: "Không tìm thấy đường dẫn" });
  } catch (error) {
    operations.increment("request_error_total");
    const message = error instanceof Error ? error.message : "Lỗi máy chủ không xác định";
    return writeJson(response, message.includes("không hợp lệ") ? 401 : 400, { error: message });
  } finally {
    operations.recordLatency(performance.now() - startedAt);
  }
});

server.listen(port, () => {
  console.log(`Máy chủ API đang chạy tại http://localhost:${port}`);
});

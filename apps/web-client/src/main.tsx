import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";

import { CommandCenter } from "./CommandCenter";
import { GameCanvas } from "./game/GameCanvas";
import type { ConnectionStatus } from "./game/network";
import "./styles.css";

const initialRoomCode =
  new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "NOVA";

window.addEventListener("error", (event) => {
  const apiBase =
    window.location.port === "5173"
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : `${window.location.origin}/api`;
  void fetch(`${apiBase}/telemetry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "client_error", message: event.message.slice(0, 300) })
  }).catch(() => undefined);
});

const App = () => {
  const [roomInput, setRoomInput] = useState(initialRoomCode);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState("Đang chuẩn bị chiến trường");
  const [playerCount, setPlayerCount] = useState(0);
  const [centerOpen, setCenterOpen] = useState(false);

  const handleStatus = useCallback(
    (nextStatus: ConnectionStatus, detail: string, count?: number) => {
      setStatus(nextStatus);
      setStatusDetail(detail);
      if (count !== undefined) setPlayerCount(count);
    },
    []
  );

  const joinRoom = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanCode = roomInput
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    if (cleanCode.length < 3) return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", cleanCode);
    window.history.replaceState(null, "", url);
    setRoomCode(cleanCode);
  };

  const enterRoom = useCallback((code: string) => {
    const cleanCode = code
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    const url = new URL(window.location.href);
    url.searchParams.set("room", cleanCode);
    window.history.replaceState(null, "", url);
    setRoomInput(cleanCode);
    setRoomCode(cleanCode);
  }, []);

  return (
    <main className="game-shell">
      <header className="command-bar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <div>
            <h1>Aetherion Strategy</h1>
            <p>Chiến thuật thời gian thực</p>
          </div>
        </div>

        <form className="room-form" onSubmit={joinRoom}>
          <label htmlFor="room-code">Phòng</label>
          <input
            id="room-code"
            maxLength={8}
            onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
            spellCheck={false}
            value={roomInput}
          />
          <button type="submit">Vào trận</button>
          <button className="center-button" type="button" onClick={() => setCenterOpen(true)}>
            Trung tâm
          </button>
        </form>

        <div className="connection-block" aria-live="polite">
          <span className={`status-dot status-${status}`} />
          <div>
            <strong>{statusDetail}</strong>
            <span>{playerCount}/2 chỉ huy</span>
          </div>
        </div>
      </header>

      <section className="battlefield" aria-label="Chiến trường Aetherion">
        <GameCanvas roomCode={roomCode} onStatus={handleStatus} />
        <aside className="controls-strip">
          <span>
            <kbd>WASD</kbd> Di chuyển tướng
          </span>
          <span>
            <kbd>Shift</kbd> Lướt nhanh
          </span>
          <span>
            <kbd>Kéo chuột</kbd> Chọn quân
          </span>
          <span>
            <kbd>Chuột phải</kbd> Di chuyển đội hình
          </span>
          <span>
            <kbd>Ctrl 1-5</kbd> Lưu nhóm
          </span>
          <span>
            <kbd>H / X / R</kbd> Giữ / dừng / rút lui
          </span>
          <span>
            <kbd>F / Chuột phải</kbd> Tấn công
          </span>
          <span>
            <kbd>Q / E</kbd> Xung lực / xuyên phá
          </span>
          <span>
            <kbd>C</kbd> Pháo sáng trinh sát
          </span>
          <span>
            <kbd>Cuộn / Chuột giữa</kbd> Thu phóng / kéo bản đồ
          </span>
          <span>
            <kbd>F1-F5</kbd> Xây công trình
          </span>
          <span>
            <kbd>J K L N M P</kbd> Huấn luyện sáu loại quân
          </span>
          <span>
            <kbd>Z</kbd> Đổi đội hình
          </span>
          <span>
            <kbd>Chuột phải công trình</kbd> Điểm tập kết
          </span>
          <span>
            <kbd>O</kbd> Đầu hàng
          </span>
        </aside>
      </section>
      <CommandCenter
        open={centerOpen}
        onClose={() => setCenterOpen(false)}
        onJoinRoom={enterRoom}
      />
    </main>
  );
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Không tìm thấy phần tử gốc của ứng dụng");

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

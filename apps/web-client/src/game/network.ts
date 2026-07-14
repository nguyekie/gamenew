import type {
  ClientGameMessage,
  GameSnapshot,
  JoinedRoomMessage,
  ServerGameMessage
} from "@aetherion/shared-types";

export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "offline" | "error";

interface NetworkCallbacks {
  onJoined: (message: JoinedRoomMessage) => void;
  onSnapshot: (message: GameSnapshot) => void;
  onStatus: (status: ConnectionStatus, detail: string) => void;
}

export class GameNetwork {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private stopped = false;

  constructor(
    private readonly roomCode: string,
    private readonly callbacks: NetworkCallbacks
  ) {}

  connect() {
    this.stopped = false;
    this.callbacks.onStatus("connecting", "Đang kết nối máy chủ trận đấu");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host =
      window.location.port === "5173" ? `${window.location.hostname}:3001` : window.location.host;
    this.socket = new WebSocket(`${protocol}://${host}/realtime`);
    this.socket.addEventListener("open", () => {
      const reconnectToken =
        sessionStorage.getItem(`aetherion-token-${this.roomCode}`) ?? undefined;
      this.send(
        reconnectToken
          ? { type: "join", roomCode: this.roomCode, reconnectToken }
          : { type: "join", roomCode: this.roomCode }
      );
    });
    this.socket.addEventListener("message", (event) => this.receive(String(event.data)));
    this.socket.addEventListener("close", () => this.reconnect());
    this.socket.addEventListener("error", () =>
      this.callbacks.onStatus("error", "Máy chủ thời gian thực chưa sẵn sàng")
    );
  }

  send(message: ClientGameMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close() {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private receive(raw: string) {
    const message = JSON.parse(raw) as ServerGameMessage;
    if (message.type === "joined") {
      sessionStorage.setItem(`aetherion-token-${this.roomCode}`, message.reconnectToken);
      this.callbacks.onJoined(message);
      this.callbacks.onStatus("online", message.reconnected ? "Đã kết nối lại" : "Đã vào phòng");
    } else if (message.type === "snapshot") {
      this.callbacks.onSnapshot(message);
    } else {
      this.callbacks.onStatus("error", message.message);
    }
  }

  private reconnect() {
    if (this.stopped) return;
    this.callbacks.onStatus("reconnecting", "Mất kết nối, đang thử kết nối lại");
    this.reconnectTimer = window.setTimeout(() => this.connect(), 1200);
  }
}

import { useEffect, useMemo, useState } from "react";

import type { CombatLogEntry, GameSnapshot } from "@aetherion/shared-types";

import { apiRequest, authenticate, loadLocalProfile, type MatchInfo, type Profile } from "./api";
import {
  CHAPTER_ONE,
  applyTutorialEvent,
  completeMission,
  contextualDialogue,
  createMissionRuntime,
  loadStory,
  saveStory,
  type MissionRuntime,
  type StoryState,
  type TutorialEvent
} from "./tutorial";

type PanelTab = "tutorial" | "match" | "settings" | "replay" | "admin";

interface Settings {
  sound: boolean;
  effects: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  uiScale: number;
}

interface CommandCenterProps {
  open: boolean;
  onClose: () => void;
  onJoinRoom: (roomCode: string) => void;
}

const defaultSettings: Settings = {
  sound: true,
  effects: true,
  reducedMotion: false,
  highContrast: false,
  uiScale: 100
};

const expectedEvent = (type: TutorialEvent["type"], target?: string): TutorialEvent => {
  if (type === "select-units") return { type, count: 4 };
  if (type === "enter-zone") return { type, zoneId: target ?? "" };
  if (type === "build") return { type, building: target ?? "" };
  return { type };
};

export const CommandCenter = ({ open, onClose, onJoinRoom }: CommandCenterProps) => {
  const [tab, setTab] = useState<PanelTab>("tutorial");
  const [story, setStory] = useState<StoryState>(loadStory);
  const mission = CHAPTER_ONE.find((item) => item.id === story.currentMissionId) ?? CHAPTER_ONE[0]!;
  const [runtime, setRuntime] = useState<MissionRuntime>(() => createMissionRuntime(mission.id));
  const [profile, setProfile] = useState<Profile | null>(loadLocalProfile);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("aetherion-settings");
    return saved ? (JSON.parse(saved) as Settings) : defaultSettings;
  });
  const [timeline, setTimeline] = useState<CombatLogEntry[]>([]);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [matches, setMatches] = useState<MatchInfo[]>([]);

  useEffect(() => {
    saveStory(story);
  }, [story]);

  useEffect(() => {
    localStorage.setItem("aetherion-settings", JSON.stringify(settings));
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
    document.documentElement.classList.toggle("reduced-motion", settings.reducedMotion);
    document.documentElement.style.setProperty("--ui-scale", String(settings.uiScale / 100));
  }, [settings]);

  useEffect(() => {
    if (!open) return;
    const listener = (event: Event) => {
      const snapshot = (event as CustomEvent<GameSnapshot>).detail;
      setTimeline((current) => {
        const merged = new Map(
          [...current, ...snapshot.combatLog].map((entry) => [entry.id, entry])
        );
        return [...merged.values()].sort((a, b) => a.tick - b.tick).slice(-80);
      });
    };
    window.addEventListener("aetherion:snapshot", listener);
    return () => window.removeEventListener("aetherion:snapshot", listener);
  }, [open]);

  useEffect(() => {
    if (!queueing || !profile) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await apiRequest<{ status: string; match?: MatchInfo }>(
          "/matchmaking/status"
        );
        if (result.status === "matched" && result.match) {
          setQueueing(false);
          setNotice(`Đã ghép trận, phòng ${result.match.roomCode}`);
          onJoinRoom(result.match.roomCode);
          onClose();
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Không kiểm tra được hàng chờ");
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [onClose, onJoinRoom, profile, queueing]);

  const currentObjective = mission.objectives.find(
    (objective) => !runtime.completedObjectiveIds.includes(objective.id)
  );
  const dialogue = useMemo(() => contextualDialogue(mission, story), [mission, story]);

  const advanceObjective = () => {
    if (!currentObjective) return;
    setRuntime((current) =>
      applyTutorialEvent(
        mission,
        current,
        expectedEvent(currentObjective.event, currentObjective.target)
      )
    );
  };

  const finishMission = (choiceValue?: string) => {
    const next = completeMission(
      story,
      mission.id,
      mission.choice && choiceValue ? { id: mission.choice.id, value: choiceValue } : undefined
    );
    setStory(next);
    setRuntime(createMissionRuntime(next.currentMissionId));
  };

  const submitAuth = async (mode: "login" | "register") => {
    try {
      const session = await authenticate(mode, name, password);
      setProfile(session.profile);
      setNotice(`Chào mừng ${session.profile.displayName}`);
      setPassword("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể đăng nhập");
    }
  };

  const joinQueue = async () => {
    try {
      const result = await apiRequest<{ status: string; match?: MatchInfo }>("/matchmaking/join", {
        method: "POST",
        body: JSON.stringify({ region: "sea", latencyMs: 45 })
      });
      if (result.status === "matched" && result.match) onJoinRoom(result.match.roomCode);
      else {
        setQueueing(true);
        setNotice("Đang tìm đối thủ phù hợp tại khu vực Đông Nam Á...");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể vào hàng chờ");
    }
  };

  const loadAdmin = async () => {
    try {
      const [nextMetrics, nextMatches] = await Promise.all([
        apiRequest<Record<string, unknown>>("/admin/metrics"),
        apiRequest<MatchInfo[]>("/admin/matches")
      ]);
      setMetrics(nextMetrics);
      setMatches(nextMatches);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không tải được dữ liệu vận hành");
    }
  };

  if (!open) return null;
  return (
    <section className="command-center" aria-label="Trung tâm chỉ huy">
      <header>
        <div>
          <strong>Trung tâm chỉ huy</strong>
          <span>{profile ? `${profile.displayName} · MMR ${profile.mmr}` : "Chưa đăng nhập"}</span>
        </div>
        <button className="icon-button" onClick={onClose} title="Đóng" aria-label="Đóng">
          ×
        </button>
      </header>
      <nav className="panel-tabs" aria-label="Các mục">
        {(
          [
            ["tutorial", "Hướng dẫn"],
            ["match", "Thi đấu"],
            ["settings", "Cài đặt"],
            ["replay", "Diễn biến"],
            ["admin", "Vận hành"]
          ] as const
        ).map(([value, label]) => (
          <button
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="panel-content">
        {tab === "tutorial" && (
          <div className="tutorial-panel">
            <div className="mission-progress">
              Chương 1 · {story.completedMissionIds.length}/5 nhiệm vụ
            </div>
            <h2>{mission.title}</h2>
            <p>{mission.briefing}</p>
            <blockquote>{dialogue[runtime.dialogueIndex] ?? dialogue.at(-1)}</blockquote>
            <ol className="objectives">
              {mission.objectives.map((objective) => (
                <li
                  className={runtime.completedObjectiveIds.includes(objective.id) ? "done" : ""}
                  key={objective.id}
                >
                  <strong>{objective.text}</strong>
                  <span>{objective.hint}</span>
                </li>
              ))}
            </ol>
            {currentObjective && (
              <button className="primary" onClick={advanceObjective}>
                Đã thực hiện bước này
              </button>
            )}
            {runtime.finished &&
              mission.choice &&
              mission.choice.options.map((option) => (
                <button key={option.id} onClick={() => finishMission(option.id)}>
                  {option.label}
                </button>
              ))}
            {runtime.finished && !mission.choice && (
              <button className="primary" onClick={() => finishMission()}>
                Sang nhiệm vụ tiếp theo
              </button>
            )}
            <button onClick={() => setRuntime(createMissionRuntime(mission.id))}>
              Khởi động lại nhiệm vụ
            </button>
          </div>
        )}

        {tab === "match" && (
          <div className="match-panel">
            {!profile ? (
              <>
                <h2>Hồ sơ chỉ huy</h2>
                <label>
                  Tên chỉ huy
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                  Mật khẩu
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <div className="button-row">
                  <button className="primary" onClick={() => submitAuth("login")}>
                    Đăng nhập
                  </button>
                  <button onClick={() => submitAuth("register")}>Tạo hồ sơ</button>
                </div>
              </>
            ) : (
              <>
                <h2>{profile.displayName}</h2>
                <div className="rank-stats">
                  <span>
                    <strong>{profile.mmr}</strong> MMR
                  </span>
                  <span>
                    <strong>{profile.wins}</strong> thắng
                  </span>
                  <span>
                    <strong>{profile.losses}</strong> thua
                  </span>
                </div>
                <button className="primary" disabled={queueing} onClick={joinQueue}>
                  {queueing ? "Đang tìm đối thủ..." : "Tìm trận xếp hạng 1v1"}
                </button>
              </>
            )}
            <button
              onClick={() => {
                onJoinRoom(`BOT${Math.random().toString(36).slice(2, 7).toUpperCase()}`);
                onClose();
              }}
            >
              Luyện tập với máy
            </button>
          </div>
        )}

        {tab === "settings" && (
          <div className="settings-panel">
            <h2>Trải nghiệm và trợ năng</h2>
            {(
              [
                ["sound", "Âm thanh giao diện"],
                ["effects", "Hiệu ứng chiến đấu"],
                ["reducedMotion", "Giảm chuyển động"],
                ["highContrast", "Tương phản cao"]
              ] as const
            ).map(([key, label]) => (
              <label className="toggle" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })}
                />
              </label>
            ))}
            <label className="range-label">
              Kích thước giao diện: {settings.uiScale}%
              <input
                type="range"
                min="85"
                max="120"
                step="5"
                value={settings.uiScale}
                onChange={(event) =>
                  setSettings({ ...settings, uiScale: Number(event.target.value) })
                }
              />
            </label>
          </div>
        )}

        {tab === "replay" && (
          <div className="replay-panel">
            <h2>Dòng thời gian trận đấu</h2>
            {timeline.length === 0 ? (
              <p>Diễn biến sẽ xuất hiện khi trận đấu bắt đầu.</p>
            ) : (
              timeline.map((entry) => (
                <div key={entry.id}>
                  <time>Nhịp {entry.tick}</time>
                  <span>{entry.text}</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "admin" && (
          <div className="admin-panel">
            <h2>Theo dõi vận hành</h2>
            <button className="primary" onClick={loadAdmin}>
              Làm mới dữ liệu
            </button>
            {metrics && <pre>{JSON.stringify(metrics, null, 2)}</pre>}
            <p>{matches.length} trận gần nhất</p>
            {matches.map((match) => (
              <div key={match.id}>
                <strong>{match.roomCode}</strong>
                <span>{match.winnerId ? "Đã kết thúc" : "Đang diễn ra"}</span>
              </div>
            ))}
          </div>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </section>
  );
};

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface PublicProfile {
  id: string;
  displayName: string;
  mmr: number;
  wins: number;
  losses: number;
}

interface UserRecord extends PublicProfile {
  passwordHash: string;
  salt: string;
}

interface QueueEntry {
  userId: string;
  region: string;
  latencyMs: number;
  joinedAt: number;
}

export interface MatchRecord {
  id: string;
  roomCode: string;
  playerIds: [string, string];
  winnerId: string | null;
  createdAt: number;
  finishedAt: number | null;
}

const profileOf = ({ id, displayName, mmr, wins, losses }: UserRecord): PublicProfile => ({
  id,
  displayName,
  mmr,
  wins,
  losses
});

export class OperationsService {
  private readonly users = new Map<string, UserRecord>();
  private readonly names = new Map<string, string>();
  private readonly tokens = new Map<string, string>();
  private readonly queue: QueueEntry[] = [];
  private readonly matches = new Map<string, MatchRecord>();
  private readonly results = new Set<string>();
  private readonly counters = new Map<string, number>();
  private readonly latencySamples: number[] = [];

  register(displayName: string, password: string) {
    const normalized = displayName.trim().toLocaleLowerCase("vi");
    if (displayName.trim().length < 3 || password.length < 6)
      throw new Error("Tên chỉ huy cần ít nhất 3 ký tự và mật khẩu cần ít nhất 6 ký tự");
    if (this.names.has(normalized)) throw new Error("Tên chỉ huy đã được sử dụng");
    const salt = randomBytes(16).toString("hex");
    const user: UserRecord = {
      id: `usr_${randomBytes(8).toString("hex")}`,
      displayName: displayName.trim(),
      passwordHash: scryptSync(password, salt, 32).toString("hex"),
      salt,
      mmr: 1000,
      wins: 0,
      losses: 0
    };
    this.users.set(user.id, user);
    this.names.set(normalized, user.id);
    return this.createSession(user);
  }

  login(displayName: string, password: string) {
    const id = this.names.get(displayName.trim().toLocaleLowerCase("vi"));
    const user = id ? this.users.get(id) : undefined;
    if (!user) throw new Error("Tên chỉ huy hoặc mật khẩu không đúng");
    const actual = Buffer.from(user.passwordHash, "hex");
    const candidate = scryptSync(password, user.salt, 32);
    if (!timingSafeEqual(actual, candidate))
      throw new Error("Tên chỉ huy hoặc mật khẩu không đúng");
    return this.createSession(user);
  }

  authenticate(token: string | undefined) {
    const user = token ? this.users.get(this.tokens.get(token) ?? "") : undefined;
    if (!user) throw new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn");
    return user;
  }

  joinQueue(userId: string, region: string, latencyMs: number, now = Date.now()) {
    const existing = this.queue.find((entry) => entry.userId === userId);
    if (!existing)
      this.queue.push({
        userId,
        region: region.slice(0, 16),
        latencyMs: Math.max(0, Math.min(999, latencyMs)),
        joinedAt: now
      });
    return this.tryMatch(userId, now);
  }

  queueStatus(userId: string, now = Date.now()) {
    const match = [...this.matches.values()].find(
      (candidate) => candidate.winnerId === null && candidate.playerIds.includes(userId)
    );
    if (match) return { status: "matched" as const, match };
    const entry = this.queue.find((candidate) => candidate.userId === userId);
    return entry
      ? { status: "queued" as const, waitedMs: now - entry.joinedAt }
      : { status: "idle" as const };
  }

  leaveQueue(userId: string) {
    const index = this.queue.findIndex((entry) => entry.userId === userId);
    if (index >= 0) this.queue.splice(index, 1);
  }

  recordResult(matchId: string, winnerId: string, resultId: string) {
    if (this.results.has(resultId)) return { updated: false, reason: "Kết quả đã được xử lý" };
    const match = this.matches.get(matchId);
    if (!match || !match.playerIds.includes(winnerId)) throw new Error("Kết quả trận không hợp lệ");
    const loserId = match.playerIds.find((id) => id !== winnerId)!;
    const winner = this.users.get(winnerId)!;
    const loser = this.users.get(loserId)!;
    const expected = 1 / (1 + 10 ** ((loser.mmr - winner.mmr) / 400));
    const change = Math.max(8, Math.round(28 * (1 - expected)));
    winner.mmr += change;
    winner.wins += 1;
    loser.mmr = Math.max(0, loser.mmr - change);
    loser.losses += 1;
    match.winnerId = winnerId;
    match.finishedAt = Date.now();
    this.results.add(resultId);
    this.increment("match_finished_total");
    return { updated: true, change };
  }

  recordLatency(value: number) {
    this.latencySamples.push(Math.max(0, value));
    if (this.latencySamples.length > 500) this.latencySamples.shift();
  }

  increment(metric: string) {
    this.counters.set(metric, (this.counters.get(metric) ?? 0) + 1);
  }

  metrics() {
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return {
      counters: Object.fromEntries(this.counters),
      queueSize: this.queue.length,
      activeMatches: [...this.matches.values()].filter((match) => match.winnerId === null).length,
      latencyP95Ms: Math.round(p95)
    };
  }

  listMatches() {
    return [...this.matches.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
  }

  profile(userId: string) {
    const user = this.users.get(userId);
    if (!user) throw new Error("Không tìm thấy hồ sơ");
    return profileOf(user);
  }

  private createSession(user: UserRecord) {
    const token = randomBytes(24).toString("base64url");
    this.tokens.set(token, user.id);
    return { token, profile: profileOf(user) };
  }

  private tryMatch(userId: string, now: number) {
    const entry = this.queue.find((candidate) => candidate.userId === userId);
    if (!entry) return this.queueStatus(userId, now);
    const user = this.users.get(userId)!;
    const tolerance = Math.min(500, 100 + Math.floor((now - entry.joinedAt) / 10_000) * 50);
    const opponent = this.queue.find((candidate) => {
      if (candidate.userId === userId || candidate.region !== entry.region) return false;
      const rival = this.users.get(candidate.userId)!;
      return (
        Math.abs(rival.mmr - user.mmr) <= tolerance &&
        Math.max(candidate.latencyMs, entry.latencyMs) <= 220
      );
    });
    if (!opponent) return { status: "queued" as const, waitedMs: now - entry.joinedAt };
    const roomCode = randomBytes(3).toString("hex").toUpperCase();
    const match: MatchRecord = {
      id: `mat_${randomBytes(8).toString("hex")}`,
      roomCode,
      playerIds: [entry.userId, opponent.userId],
      winnerId: null,
      createdAt: now,
      finishedAt: null
    };
    this.matches.set(match.id, match);
    this.leaveQueue(entry.userId);
    this.leaveQueue(opponent.userId);
    this.increment("match_created_total");
    return { status: "matched" as const, match };
  }
}

export class SlidingWindowRateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  allow(key: string, now = Date.now()) {
    const recent = (this.requests.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    this.requests.set(key, recent);
    return true;
  }
}

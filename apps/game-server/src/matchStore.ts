import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { Pool } from "pg";

import type { CombatLogEntry, MatchStats } from "@aetherion/shared-types";

export interface StoredMatchResult {
  roomCode: string;
  winnerId: string;
  reason: string;
  startedAt: number;
  finishedAt: number;
  stats: Record<string, MatchStats>;
  events: CombatLogEntry[];
}

export class MatchStore {
  private pool: Pool | null = null;

  async save(result: StoredMatchResult) {
    if (process.env.DATABASE_URL) {
      try {
        this.pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS match_results (
            id BIGSERIAL PRIMARY KEY,
            room_code TEXT NOT NULL,
            winner_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            started_at TIMESTAMPTZ NOT NULL,
            finished_at TIMESTAMPTZ NOT NULL,
            stats JSONB NOT NULL,
            events JSONB NOT NULL
          )
        `);
        await this.pool.query(
          "INSERT INTO match_results (room_code, winner_id, reason, started_at, finished_at, stats, events) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [
            result.roomCode,
            result.winnerId,
            result.reason,
            new Date(result.startedAt),
            new Date(result.finishedAt),
            result.stats,
            result.events
          ]
        );
        return "postgres" as const;
      } catch (error) {
        console.error("Không thể lưu trận vào PostgreSQL; đang dùng tệp cục bộ", error);
      }
    }
    const path = resolve("data", "matches.jsonl");
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(result)}\n`, "utf8");
    return "jsonl" as const;
  }
}

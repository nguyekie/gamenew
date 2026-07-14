import { describe, expect, it } from "vitest";

import { findServerPath } from "./pathfinding.js";

describe("server unit pathfinding", () => {
  it("routes authoritative units around obstacles", () => {
    const path = findServerPath({ x: 430, y: 350 }, { x: 850, y: 350 });
    expect(path.length).toBeGreaterThan(10);
    expect(path.at(-1)).toEqual({ x: 850, y: 350 });
  });
});

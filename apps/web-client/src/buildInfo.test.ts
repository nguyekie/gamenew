import { describe, expect, it } from "vitest";

import { developmentBuildTitle } from "./buildInfo";

describe("development build copy", () => {
  it("matches the Phase 0 acceptance text", () => {
    expect(developmentBuildTitle).toBe("Aetherion Strategy - Bản phát triển");
  });
});

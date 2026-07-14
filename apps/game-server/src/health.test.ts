import { describe, expect, it } from "vitest";

import { createHealthResponse } from "@aetherion/shared-types";

describe("game health contract", () => {
  it("uses the shared game health service name", () => {
    expect(createHealthResponse("game-server", "0.0.0").service).toBe("game-server");
  });
});

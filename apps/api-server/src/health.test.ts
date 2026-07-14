import { describe, expect, it } from "vitest";

import { createHealthResponse } from "@aetherion/shared-types";

describe("api health contract", () => {
  it("uses the shared API health service name", () => {
    expect(createHealthResponse("api-server", "0.0.0").service).toBe("api-server");
  });
});

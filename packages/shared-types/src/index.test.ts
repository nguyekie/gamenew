import { describe, expect, it } from "vitest";

import { createHealthResponse } from "./index";

describe("createHealthResponse", () => {
  it("creates a stable health payload contract", () => {
    const response = createHealthResponse("api-server", "0.0.0");

    expect(response.service).toBe("api-server");
    expect(response.status).toBe("ok");
    expect(response.version).toBe("0.0.0");
    expect(Date.parse(response.timestamp)).not.toBeNaN();
  });
});

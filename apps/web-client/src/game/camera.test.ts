import { describe, expect, it } from "vitest";

import { minimumCameraZoom } from "./camera";

describe("camera bounds", () => {
  it("keeps the default zoom limit on a small viewport", () => {
    expect(minimumCameraZoom(1280, 720)).toBe(0.65);
  });

  it("prevents a wide viewport from exposing space outside the map", () => {
    const zoom = minimumCameraZoom(1920, 900);
    expect(1920 / zoom).toBeLessThanOrEqual(2400);
    expect(900 / zoom).toBeLessThanOrEqual(1600);
  });

  it("caps the required zoom for an exceptionally large viewport", () => {
    expect(minimumCameraZoom(5000, 3000)).toBe(1.55);
  });
});


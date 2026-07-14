import { MAP_SIZE } from "@aetherion/shared-types";

export const BASE_MIN_ZOOM = 0.65;
export const MAX_ZOOM = 1.55;

export const minimumCameraZoom = (viewportWidth: number, viewportHeight: number) =>
  Math.min(
    MAX_ZOOM,
    Math.max(BASE_MIN_ZOOM, viewportWidth / MAP_SIZE.width, viewportHeight / MAP_SIZE.height)
  );


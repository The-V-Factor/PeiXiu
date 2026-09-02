import type { RouteInput, RouteResult } from "../routing/types.js";
import type { CameraAwareRouteResult, CameraDataset } from "./types.js";

export function routeWithCameraAvoidance(
  input: RouteInput,
  options: {
    route(input: RouteInput): Promise<RouteResult>;
    loadCameras(): Promise<CameraDataset>;
    corridorMeters?: number;
    maxDetourMeters?: number;
    maxAvoidanceAttempts?: number;
  },
): Promise<CameraAwareRouteResult>;

import type { CameraPoint } from "./types.js";
import type { RouteResult } from "../routing/types.js";

export function pointToRouteDistanceMeters(point: CameraPoint, route: RouteResult): number;
export function selectCamerasNearRoute(route: RouteResult, cameras: CameraPoint[], corridorMeters?: number): CameraPoint[];

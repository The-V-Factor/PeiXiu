import type { RouteResult } from "../routing/types.js";

export type CameraPoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  description?: string;
};

export type CameraDataset = {
  version: 1;
  region: string;
  updatedAt: string;
  source: string;
  cameras: CameraPoint[];
};

export type CameraAvoidanceStatus = "not-needed" | "applied" | "unavailable" | "failed";

export type CameraAwareRouteResult = RouteResult & {
  cameraAvoidanceStatus: CameraAvoidanceStatus;
  cameraAvoidanceMessage?: string;
  primaryRoute?: RouteResult;
};

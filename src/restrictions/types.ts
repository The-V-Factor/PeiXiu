import type { RouteResult } from "../routing/types.js";

export type CameraPoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  description?: string;
  restriction?: string;
  direction?: string;
  vehicleScope?: "motorcycle" | "motorcycle-and-truck" | "truck" | "general";
  locationType?: "exact" | "approximate";
  accuracyMeters?: number;
};

export type CameraDataset = {
  version: 1;
  region: string;
  updatedAt: string;
  source: string;
  cameras: CameraPoint[];
};

export type CameraManifest = {
  version: 1;
  region: string;
  datasetVersion: string;
  updatedAt: string;
  dataUrl: string;
};

export type CameraAvoidanceStatus = "not-needed" | "applied" | "unavailable" | "failed";

export type CameraAwareRouteResult = RouteResult & {
  cameraAvoidanceStatus: CameraAvoidanceStatus;
  cameraAvoidanceMessage?: string;
  nearbyCameraCount?: number;
  primaryRoute?: RouteResult;
};

import type { CameraDataset, CameraManifest } from "./types.js";

type CameraResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type CameraRequestInit = {
  cache?: RequestCache;
};

export function parseCameraDataset(value: unknown): CameraDataset;
export function loadCameraDataset(
  url: string,
  fetchImpl?: (url: string, init?: CameraRequestInit) => Promise<CameraResponse>,
): Promise<CameraDataset>;
export function parseCameraManifest(value: unknown): CameraManifest;
export function loadCameraDatasetFromManifest(
  manifestUrl: string,
  fetchImpl?: (url: string, init?: CameraRequestInit) => Promise<CameraResponse>,
): Promise<CameraDataset>;

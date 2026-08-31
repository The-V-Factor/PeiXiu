import type { CameraDataset } from "./types.js";

type CameraResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export function parseCameraDataset(value: unknown): CameraDataset;
export function loadCameraDataset(
  url: string,
  fetchImpl?: (url: string) => Promise<CameraResponse>,
): Promise<CameraDataset>;

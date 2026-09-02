import type { CameraPoint } from "./types.js";

type CameraStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function loadLocalTestCameras(storage?: CameraStorage): CameraPoint[];
export function saveLocalTestCameras(cameras: CameraPoint[], storage?: CameraStorage): void;

/// <reference lib="webworker" />

import { createMotorcycleRoutingEngine } from "./engine.js";
import { loadCameraDataset } from "../../restrictions/cameras.js";
import { routeWithCameraAvoidance } from "../../restrictions/avoidance.js";
import { createManifestTileSourceFactory } from "../tiles/provider.js";
import { routingManifestUrl } from "../config.js";
import { toRoutingError } from "../errors.js";
import type { RouteInput } from "../types.js";
import type { CameraDataset } from "../../restrictions/types.js";

type WorkerRequest = {
  type: "route";
  region: string;
  input: RouteInput;
  avoidCameras?: boolean;
  cameras?: CameraDataset["cameras"];
};

const tileSourceFactory = createManifestTileSourceFactory({
  manifestUrlForRegion: (region) => routingManifestUrl(region),
  onProgress: (message) => self.postMessage({ type: "progress", message }),
});
const engine = createMotorcycleRoutingEngine({
  initModule: () =>
    ValhallaModule({
      locateFile: (path: string) => `/${path}`,
      print: (message: string) => self.postMessage({ type: "debug", message: `[Valhalla WASM] ${message}` }),
      printErr: (message: string) => self.postMessage({ type: "debug", message: `[Valhalla WASM] ${message}` }),
    }),
  tileSourceFactory,
  onProgress: (message) => self.postMessage({ type: "progress", message }),
});

const workerGlobal = self as unknown as { global: typeof self };
workerGlobal.global = self;
importScripts("/valhalla.js");
declare const ValhallaModule: (options?: Record<string, unknown>) => Promise<any>;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "route") return;
  self.postMessage({ type: "progress", message: "已收到路线请求。" });
  try {
    const result = event.data.avoidCameras
      ? await routeWithCameraAvoidance(event.data.input, {
          route: (input) => engine(input, event.data.region),
          loadCameras: async () => {
            if (event.data.cameras) {
              return {
                version: 1,
                region: event.data.region,
                updatedAt: new Date().toISOString(),
                source: "browser-session",
                cameras: event.data.cameras,
              };
            }
            const dataset = await loadCameraDataset(`/cameras/${event.data.region}.json`);
            if (dataset.region !== event.data.region) {
              throw new Error(`Camera dataset region mismatch: ${dataset.region}`);
            }
            return dataset;
          },
          corridorMeters: 200,
        })
      : await engine(event.data.input, event.data.region);
    self.postMessage({ type: "result", result });
  } catch (error) {
    const routingError = toRoutingError(error);
    self.postMessage({
      type: "error",
      code: routingError.code,
      message: routingError.userMessage,
      retryable: routingError.retryable,
    });
  }
};

/// <reference lib="webworker" />

import { createBufferTileSource, createMotorcycleRoutingEngine } from "./engine.js";
import type { RouteInput } from "../types.js";

type WorkerRequest = {
  type: "route";
  region: string;
  input: RouteInput;
};

const tileBuffers = new Map<string, ArrayBuffer>();
const engine = createMotorcycleRoutingEngine({
  initModule: () =>
    ValhallaModule({
      locateFile: (path: string) => `/${path}`,
      print: (message: string) => self.postMessage({ type: "debug", message: `[Valhalla WASM] ${message}` }),
      printErr: (message: string) => self.postMessage({ type: "debug", message: `[Valhalla WASM] ${message}` }),
    }),
  tileSourceFactory: async (region) => {
    let buffer = tileBuffers.get(region);
    if (!buffer) {
      const response = await fetch(`/tiles/${region}-routing.tar`);
      if (!response.ok) return null;
      buffer = await response.arrayBuffer();
      tileBuffers.set(region, buffer);
    }
    return createBufferTileSource(buffer);
  },
  onProgress: (message) => self.postMessage({ type: "progress", message }),
});

const workerGlobal = self as unknown as { global: typeof self };
workerGlobal.global = self;
importScripts("/valhalla.js");
declare const ValhallaModule: (options?: Record<string, unknown>) => Promise<any>;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "route") return;
  try {
    const result = await engine(event.data.input, event.data.region);
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};

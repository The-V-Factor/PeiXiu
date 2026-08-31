import type { TileSource } from "valhalla-wasm";
import type { RouteInput } from "../types.js";

export function createManifestTileSourceFactory(options?: {
  manifestUrlForRegion?: (region: string) => string;
  fetchImpl?: (url: string) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
  onProgress?: (message: string) => void;
}): (region: string, input: RouteInput) => Promise<TileSource | null>;

import type { TileSource } from "valhalla-wasm";
import type { RouteInput } from "../types.js";
import type { RoutingManifest, RoutingManifestTile, RoutingTileCacheStats, RoutingTileCacheStorage } from "./types.js";

export type RoutingTileProvider = {
  getTile(manifest: RoutingManifest, tile: RoutingManifestTile): Promise<ArrayBuffer>;
  getManifest(region: string, options?: { forceRefresh?: boolean }): Promise<RoutingManifest>;
  getStats(): RoutingTileCacheStats;
  clear(options?: { region?: string; graphVersion?: string }): Promise<void>;
};

export type ManifestTileSourceFactory = ((region: string, input: RouteInput) => Promise<TileSource | null>) & {
  getStats(): RoutingTileCacheStats;
  clearCache(options?: { region?: string; graphVersion?: string }): Promise<void>;
  refreshManifest(region: string): Promise<RoutingManifest>;
};

export function createRoutingTileProvider(options?: {
  manifestUrlForRegion?: (region: string) => string;
  fetchImpl?: (url: string) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
  storage?: RoutingTileCacheStorage;
  maxAttempts?: number;
  onProgress?: (message: string) => void;
}): RoutingTileProvider;

export function createManifestTileSourceFactory(options?: {
  manifestUrlForRegion?: (region: string) => string;
  fetchImpl?: (url: string) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
  storage?: RoutingTileCacheStorage;
  maxAttempts?: number;
  onProgress?: (message: string) => void;
}): ManifestTileSourceFactory;

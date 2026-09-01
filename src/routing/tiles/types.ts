import type { TileSource } from "valhalla-wasm";
import type { RouteInput } from "../types.js";

export type TileBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type RoutingManifestTile = {
  tileId: string;
  path: string;
  bounds: TileBounds;
  sizeBytes?: number;
  sha256?: string;
};

export type RoutingManifest = {
  region: string;
  graphVersion: string;
  tileFormat: "valhalla-gph";
  baseUrl: string;
  generatedAt: string;
  tiles: RoutingManifestTile[];
  boundaryUrl?: string;
  coverageUrl?: string;
  source?: Record<string, unknown>;
};

export type TileSourceFactory = (region: string, input: RouteInput) => Promise<TileSource | null>;

export type RoutingTileCacheStats = {
  memoryHits: number;
  persistentHits: number;
  downloads: number;
  failures: number;
};

export type RoutingTileCacheStorage = {
  get(key: string): Promise<ArrayBuffer | null>;
  set(key: string, bytes: ArrayBuffer): Promise<void>;
  clear(scope?: { region?: string; graphVersion?: string }): Promise<void>;
};

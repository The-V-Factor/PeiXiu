import type { RouteInput } from "../types.js";
import type { RoutingManifest, RoutingManifestTile } from "./types.js";

export function parseRoutingManifest(value: unknown): RoutingManifest;
export function loadRoutingManifest(
  url: string,
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>,
): Promise<RoutingManifest>;
export function selectTilesForRoute(manifest: RoutingManifest, input: RouteInput): RoutingManifestTile[];
export function resolveTileUrl(manifest: RoutingManifest, tile: RoutingManifestTile): string;

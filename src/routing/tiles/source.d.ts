import type { TileSource } from "valhalla-wasm";

export function createGphTileSource(tiles: Array<{ path: string; bytes: ArrayBuffer }>): TileSource;

import type { RoutingTileCacheStorage } from "./types.js";

export function createIndexedDbTileStorage(options?: {
  dbName?: string;
  storeName?: string;
  indexedDBImpl?: any;
}): RoutingTileCacheStorage;

import { loadRoutingManifest, resolveTileUrl, selectTilesForRoute } from "./manifest.js";
import { createIndexedDbTileStorage } from "./indexeddb.js";
import { createGphTileSource } from "./source.js";

function cacheKey(manifest, tile) {
  return `${manifest.region}/${manifest.graphVersion}/${tile.tileId}`;
}

export function createRoutingTileProvider({
  manifestUrlForRegion = (region) => `/routing/${region}/manifest.json`,
  fetchImpl = fetch,
  storage = createIndexedDbTileStorage(),
  maxAttempts = 2,
  onProgress,
} = {}) {
  const manifests = new Map();
  const memoryCache = new Map();
  const stats = {
    memoryHits: 0,
    persistentHits: 0,
    downloads: 0,
    failures: 0,
  };

  async function getManifest(region, { forceRefresh = false } = {}) {
    if (!forceRefresh && manifests.has(region)) return manifests.get(region);

    onProgress?.(`加载 graph manifest：${region}`);
    const manifest = await loadRoutingManifest(manifestUrlForRegion(region), fetchImpl);
    if (manifest.region !== region) {
      throw new Error(`Routing manifest region mismatch: ${manifest.region}`);
    }
    manifests.set(region, manifest);
    return manifest;
  }

  async function downloadTile(manifest, tile, key) {
    const url = resolveTileUrl(manifest, tile);
    let lastError;

    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      try {
        onProgress?.(`下载 graph tile：${tile.tileId}`);
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new Error(`Graph tile request failed: HTTP ${response.status} (${tile.path})`);
        }
        const bytes = await response.arrayBuffer();
        stats.downloads += 1;
        memoryCache.set(key, bytes);
        await storage.set(key, bytes);
        return bytes;
      } catch (error) {
        lastError = error;
      }
    }

    stats.failures += 1;
    throw lastError;
  }

  const provider = {
    async getTile(manifest, tile) {
      const key = cacheKey(manifest, tile);
      const memoryBytes = memoryCache.get(key);
      if (memoryBytes) {
        stats.memoryHits += 1;
        return memoryBytes;
      }

      const persistentBytes = await storage.get(key);
      if (persistentBytes) {
        stats.persistentHits += 1;
        memoryCache.set(key, persistentBytes);
        return persistentBytes;
      }

      return downloadTile(manifest, tile, key);
    },

    async getManifest(region, options) {
      return getManifest(region, options);
    },

    getStats() {
      return { ...stats };
    },

    async clear({ region, graphVersion } = {}) {
      for (const key of memoryCache.keys()) {
        const [keyRegion, keyGraphVersion] = key.split("/", 3);
        if ((!region || keyRegion === region) && (!graphVersion || keyGraphVersion === graphVersion)) {
          memoryCache.delete(key);
        }
      }
      await storage.clear({ region, graphVersion });
    },
  };

  return provider;
}

export function createManifestTileSourceFactory(options = {}) {
  const provider = createRoutingTileProvider(options);

  const factory = async (region, input) => {
    const manifest = await provider.getManifest(region);

    const selectedTiles = selectTilesForRoute(manifest, input);
    if (selectedTiles.length === 0) {
      throw new Error(`没有 graph tile 覆盖路线起终点：${region}`);
    }

    const tiles = [];
    for (const tile of selectedTiles) {
      const bytes = await provider.getTile(manifest, tile);
      tiles.push({ path: tile.path, bytes });
    }

    return createGphTileSource(tiles);
  };

  factory.getStats = () => provider.getStats();
  factory.clearCache = (clearOptions) => provider.clear(clearOptions);
  factory.refreshManifest = (region) => provider.getManifest(region, { forceRefresh: true });
  return factory;
}

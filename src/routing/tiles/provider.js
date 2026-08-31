import { loadRoutingManifest, resolveTileUrl, selectTilesForRoute } from "./manifest.js";
import { createGphTileSource } from "./source.js";

export function createManifestTileSourceFactory({
  manifestUrlForRegion = (region) => `/routing/${region}/manifest.json`,
  fetchImpl = fetch,
  onProgress,
} = {}) {
  const manifests = new Map();
  const tileCache = new Map();

  return async (region, input) => {
    let manifest = manifests.get(region);
    if (!manifest) {
      onProgress?.(`加载 graph manifest：${region}`);
      manifest = await loadRoutingManifest(manifestUrlForRegion(region), fetchImpl);
      if (manifest.region !== region) {
        throw new Error(`Routing manifest region mismatch: ${manifest.region}`);
      }
      manifests.set(region, manifest);
    }

    const selectedTiles = selectTilesForRoute(manifest, input);
    if (selectedTiles.length === 0) {
      throw new Error(`没有 graph tile 覆盖路线起终点：${region}`);
    }

    const tiles = [];
    for (const tile of selectedTiles) {
      const cacheKey = `${manifest.region}/${manifest.graphVersion}/${tile.tileId}`;
      let bytes = tileCache.get(cacheKey);
      if (!bytes) {
        const url = resolveTileUrl(manifest, tile);
        onProgress?.(`下载 graph tile：${tile.tileId}`);
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new Error(`Graph tile request failed: HTTP ${response.status} (${tile.path})`);
        }
        bytes = await response.arrayBuffer();
        tileCache.set(cacheKey, bytes);
      }
      tiles.push({ path: tile.path, bytes });
    }

    return createGphTileSource(tiles);
  };
}

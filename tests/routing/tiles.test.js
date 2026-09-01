import test from "node:test";
import assert from "node:assert/strict";
import { parseRoutingManifest, selectTilesForRoute } from "../../src/routing/tiles/manifest.js";
import { createManifestTileSourceFactory, createRoutingTileProvider } from "../../src/routing/tiles/provider.js";

const input = {
  start: { lat: 23.12, lon: 113.26 },
  end: { lat: 23.13, lon: 113.28 },
  costing: "motorcycle",
};

const manifest = parseRoutingManifest({
  region: "guangzhou-mini",
  graphVersion: "graph-test-001",
  tileFormat: "valhalla-gph",
  baseUrl: "/routing/guangzhou-mini/graph-test-001",
  generatedAt: "2026-08-31T00:00:00Z",
  tiles: [
    {
      tileId: "near",
      path: "1/near.gph",
      bounds: { west: 113.25, south: 23.11, east: 113.29, north: 23.14 },
    },
    {
      tileId: "far",
      path: "1/far.gph",
      bounds: { west: 114, south: 24, east: 114.1, north: 24.1 },
    },
  ],
});

function okJson(value) {
  return { ok: true, status: 200, json: async () => value };
}

function okBytes(value) {
  return { ok: true, status: 200, arrayBuffer: async () => value };
}

function createFakeStorage() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key)?.slice(0) ?? null;
    },
    async set(key, bytes) {
      values.set(key, bytes.slice(0));
    },
    async clear({ region, graphVersion } = {}) {
      for (const key of values.keys()) {
        const [keyRegion, keyGraphVersion] = key.split("/", 3);
        if ((!region || keyRegion === region) && (!graphVersion || keyGraphVersion === graphVersion)) values.delete(key);
      }
    },
  };
}

test("validates manifest metadata and tile paths", () => {
  assert.deepEqual(selectTilesForRoute(manifest, input).map((tile) => tile.tileId), ["near"]);
  assert.deepEqual(selectTilesForRoute(manifest, {
    ...input,
    start: { lat: 23.12614, lon: 113.32054 },
    end: { lat: 23.13, lon: 113.32 },
  }), []);
  assert.throws(
    () => parseRoutingManifest({ ...manifest, tiles: [{ ...manifest.tiles[0], path: "../escape.gph" }] }),
    /invalid tile/,
  );
});

test("downloads only selected tiles and reuses them by graph version", async () => {
  const calls = [];
  const factory = createManifestTileSourceFactory({
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === "/routing/guangzhou-mini/manifest.json") return okJson(manifest);
      if (url === "/routing/guangzhou-mini/graph-test-001/1/near.gph") return okBytes(new Uint8Array([1, 2]).buffer);
      throw new Error(`unexpected URL: ${url}`);
    },
  });

  const first = await factory("guangzhou-mini", input);
  const second = await factory("guangzhou-mini", input);
  assert.deepEqual(factory.getStats(), {
    memoryHits: 1,
    persistentHits: 0,
    downloads: 1,
    failures: 0,
  });
  await factory.clearCache({ region: "guangzhou-mini", graphVersion: "graph-test-001" });
  await factory("guangzhou-mini", input);

  assert.equal(first.entries.length, 1);
  assert.equal(second.entries.length, 1);
  assert.deepEqual(calls, [
    "/routing/guangzhou-mini/manifest.json",
    "/routing/guangzhou-mini/graph-test-001/1/near.gph",
    "/routing/guangzhou-mini/graph-test-001/1/near.gph",
  ]);
});

test("reports missing graph tiles with HTTP status and path", async () => {
  const missingManifest = parseRoutingManifest({
    ...manifest,
    tiles: [manifest.tiles[0]],
  });
  const factory = createManifestTileSourceFactory({
    fetchImpl: async (url) => {
      if (url.endsWith("manifest.json")) return okJson(missingManifest);
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });

  await assert.rejects(
    factory("guangzhou-mini", input),
    /Graph tile request failed: HTTP 404 \(1\/near\.gph\)/,
  );
});

test("uses persistent cache before HTTP and isolates graph versions", async () => {
  const storage = createFakeStorage();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return okBytes(new Uint8Array([url.includes("v2") ? 2 : 1]).buffer);
  };
  const provider = createRoutingTileProvider({ storage, fetchImpl });
  const tile = manifest.tiles[0];
  const versionOne = { ...manifest, graphVersion: "graph-test-v1", baseUrl: "/routing/guangzhou-mini/graph-test-v1" };
  const versionTwo = { ...manifest, graphVersion: "graph-test-v2", baseUrl: "/routing/guangzhou-mini/graph-test-v2" };

  await provider.getTile(versionOne, tile);
  await provider.getTile(versionTwo, tile);
  const persistentProvider = createRoutingTileProvider({ storage, fetchImpl });
  await persistentProvider.getTile(versionOne, tile);

  assert.deepEqual(calls, [
    "/routing/guangzhou-mini/graph-test-v1/1/near.gph",
    "/routing/guangzhou-mini/graph-test-v2/1/near.gph",
  ]);
  assert.deepEqual(provider.getStats(), {
    memoryHits: 0,
    persistentHits: 0,
    downloads: 2,
    failures: 0,
  });
  assert.equal(persistentProvider.getStats().persistentHits, 1);
  await persistentProvider.clear({ graphVersion: "graph-test-v1" });
  await persistentProvider.getTile(versionOne, tile);
  await persistentProvider.getTile(versionTwo, tile);
  assert.deepEqual(calls, [
    "/routing/guangzhou-mini/graph-test-v1/1/near.gph",
    "/routing/guangzhou-mini/graph-test-v2/1/near.gph",
    "/routing/guangzhou-mini/graph-test-v1/1/near.gph",
  ]);
});

test("retries failed downloads, records failures, and clear permits redownload", async () => {
  const storage = createFakeStorage();
  let attempts = 0;
  const provider = createRoutingTileProvider({
    storage,
    maxAttempts: 2,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts <= 2) return { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) };
      return okBytes(new Uint8Array([3]).buffer);
    },
  });

  await assert.rejects(provider.getTile(manifest, manifest.tiles[0]), /HTTP 503/);
  assert.equal(provider.getStats().failures, 1);
  await provider.getTile(manifest, manifest.tiles[0]);
  assert.equal(provider.getStats().downloads, 1);
  await provider.clear({ region: manifest.region, graphVersion: manifest.graphVersion });
  await provider.getTile(manifest, manifest.tiles[0]);
  assert.equal(provider.getStats().downloads, 2);
  assert.equal(attempts, 4);
});

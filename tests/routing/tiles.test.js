import test from "node:test";
import assert from "node:assert/strict";
import { parseRoutingManifest, selectTilesForRoute } from "../../src/routing/tiles/manifest.js";
import { createManifestTileSourceFactory } from "../../src/routing/tiles/provider.js";

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

test("validates manifest metadata and tile paths", () => {
  assert.deepEqual(selectTilesForRoute(manifest, input).map((tile) => tile.tileId), ["near"]);
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

  assert.equal(first.entries.length, 1);
  assert.equal(second.entries.length, 1);
  assert.deepEqual(calls, [
    "/routing/guangzhou-mini/manifest.json",
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

import test from "node:test";
import assert from "node:assert/strict";
import { handleMapTileRequest, parseTilePath } from "../functions/_shared/map-tile-proxy.js";

test("validates tile coordinates through zoom 18", () => {
  assert.deepEqual(parseTilePath("/12/3374/1685.png"), { z: 12, x: 3374, y: 1685 });
  assert.equal(parseTilePath("/19/0/0.png"), null);
  assert.equal(parseTilePath("/12/4096/0.png"), null);
  assert.equal(parseTilePath("/12/0/4096.png"), null);
  assert.equal(parseTilePath("/12/0/0.jpg"), null);
});

test("rejects non-tile requests and query-string proxy attempts", async () => {
  const methodResponse = await handleMapTileRequest(
    new Request("https://peixiu.pages.dev/map-tiles/12/0/0.png", { method: "POST" }),
  );
  assert.equal(methodResponse.status, 405);

  const queryResponse = await handleMapTileRequest(
    new Request("https://peixiu.pages.dev/map-tiles/12/0/0.png?url=https://example.com"),
  );
  assert.equal(queryResponse.status, 400);

  const wrongPathResponse = await handleMapTileRequest(new Request("https://peixiu.pages.dev/12/0/0.png"));
  assert.equal(wrongPathResponse.status, 404);
});

test("proxies and caches successful tiles", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const stored = new Map();
  let fetchCount = 0;
  globalThis.fetch = async (url, options) => {
    fetchCount += 1;
    assert.equal(url, "https://tile.openstreetmap.org/12/0/0.png");
    assert.equal(options.method, "GET");
    return new Response("tile", { status: 200, headers: { "Content-Type": "image/png" } });
  };
  globalThis.caches = {
    default: {
      match: async (key) => stored.get(key.url),
      put: async (key, response) => stored.set(key.url, response),
    },
  };

  try {
    const first = await handleMapTileRequest(new Request("https://peixiu.pages.dev/map-tiles/12/0/0.png"));
    const head = await handleMapTileRequest(
      new Request("https://peixiu.pages.dev/map-tiles/12/0/0.png", { method: "HEAD" }),
    );
    const second = await handleMapTileRequest(new Request("https://peixiu.pages.dev/map-tiles/12/0/0.png"));
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("X-PeiXiu-Cache"), "MISS");
    assert.equal(await first.text(), "tile");
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal(head.headers.get("X-PeiXiu-Cache"), "HIT");
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("X-PeiXiu-Cache"), "HIT");
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = originalCaches;
    }
  }
});

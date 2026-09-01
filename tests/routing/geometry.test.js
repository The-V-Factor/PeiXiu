import test from "node:test";
import assert from "node:assert/strict";
import { geometryBounds, loadGeoJson, parseGeoJsonGeometry, pointInGeometry } from "../../src/routing/tiles/geometry.js";

const polygon = {
  type: "Polygon",
  coordinates: [[
    [113, 23],
    [114, 23],
    [114, 24],
    [113, 24],
    [113, 23],
  ]],
};

test("parses polygon, feature collection, and computes bounds", () => {
  const geometry = parseGeoJsonGeometry({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: polygon }],
  });

  assert.deepEqual(geometryBounds(geometry), { west: 113, south: 23, east: 114, north: 24 });
  assert.equal(pointInGeometry({ lon: 113.5, lat: 23.5 }, geometry), true);
  assert.equal(pointInGeometry({ lon: 114.5, lat: 23.5 }, geometry), false);
});

test("respects polygon holes", () => {
  const geometry = parseGeoJsonGeometry({
    ...polygon,
    coordinates: [polygon.coordinates[0], [
      [113.25, 23.25],
      [113.75, 23.25],
      [113.75, 23.75],
      [113.25, 23.75],
      [113.25, 23.25],
    ]],
  });

  assert.equal(pointInGeometry({ lon: 113.1, lat: 23.1 }, geometry), true);
  assert.equal(pointInGeometry({ lon: 113.5, lat: 23.5 }, geometry), false);
});

test("loads and validates GeoJSON with HTTP errors", async () => {
  const geometry = await loadGeoJson("https://cdn.example.test/boundary.geojson", async (url) => {
    assert.equal(url, "https://cdn.example.test/boundary.geojson");
    return { ok: true, status: 200, json: async () => polygon };
  });
  assert.equal(geometry.type, "Polygon");
  await assert.rejects(
    loadGeoJson("https://cdn.example.test/missing.geojson", async () => ({ ok: false, status: 404 })),
    /HTTP 404/,
  );
});

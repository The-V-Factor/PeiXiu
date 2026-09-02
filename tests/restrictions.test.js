import test from "node:test";
import assert from "node:assert/strict";
import { loadCameraDatasetFromManifest, parseCameraDataset, parseCameraManifest } from "../src/restrictions/cameras.js";
import { loadLocalTestCameras, saveLocalTestCameras } from "../src/restrictions/local-test-cameras.js";
import { pointToRouteDistanceMeters, selectCamerasNearRoute } from "../src/restrictions/geometry.js";
import { routeWithCameraAvoidance } from "../src/restrictions/avoidance.js";

const route = {
  distanceMeters: 1000,
  durationSeconds: 60,
  geometry: {
    type: "LineString",
    coordinates: [
      [113.27, 23.12],
      [113.27, 23.13],
    ],
  },
  avoidedCameraCount: 0,
};

const dataset = parseCameraDataset({
  version: 1,
  region: "guangzhou-mini",
  updatedAt: "2026-08-31",
  source: "test",
  cameras: [
    { id: "near", name: "近点", lat: 23.125, lon: 113.2701, type: "motorcycle-camera" },
    { id: "far", name: "远点", lat: 23.125, lon: 113.274, type: "motorcycle-camera" },
  ],
});

test("parses camera dataset and rejects invalid coordinates", () => {
  assert.equal(dataset.cameras.length, 2);
  assert.throws(
    () => parseCameraDataset({ ...dataset, cameras: [{ ...dataset.cameras[0], lat: 91 }] }),
    /invalid camera/,
  );
});

test("preserves approximate enforcement metadata", () => {
  const parsed = parseCameraDataset({
    ...dataset,
    cameras: [{
      ...dataset.cameras[0],
      restriction: "摩托闯禁",
      direction: "南往北",
      vehicleScope: "motorcycle",
      locationType: "approximate",
      accuracyMeters: 200,
    }],
  });
  assert.equal(parsed.cameras[0].locationType, "approximate");
  assert.equal(parsed.cameras[0].accuracyMeters, 200);
});

test("selects cameras inside the 20 meter route corridor", () => {
  assert.ok(pointToRouteDistanceMeters(dataset.cameras[0], route) < 20);
  assert.ok(pointToRouteDistanceMeters(dataset.cameras[1], route) > 20);
  assert.deepEqual(selectCamerasNearRoute(route, dataset.cameras), [dataset.cameras[0]]);
});

test("uses the uncertainty radius for approximate motorcycle candidates", () => {
  const approximate = {
    ...dataset.cameras[1],
    locationType: "approximate",
    accuracyMeters: 500,
    vehicleScope: "motorcycle",
  };
  assert.ok(pointToRouteDistanceMeters(approximate, route) > 20);
  assert.deepEqual(selectCamerasNearRoute(route, [approximate]), [approximate]);
});

test("does not use truck-only or pressure-line points for motorcycle avoidance", () => {
  const excluded = [
    { ...dataset.cameras[0], vehicleScope: "truck", restriction: "货车闯禁" },
    { ...dataset.cameras[0], vehicleScope: "general", restriction: "压线抓拍" },
  ];
  assert.deepEqual(selectCamerasNearRoute(route, excluded), []);
});

test("runs a second route with nearby camera coordinates", async () => {
  const calls = [];
  const result = await routeWithCameraAvoidance(
    { start: { lat: 23.12, lon: 113.26 }, end: { lat: 23.13, lon: 113.28 }, costing: "motorcycle" },
    {
      route: async (input) => {
        calls.push(input);
        return calls.length === 1 ? route : { ...route, distanceMeters: 1200 };
      },
      loadCameras: async () => dataset,
    },
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].excludeLocations, [{ lat: 23.125, lon: 113.2701 }]);
  assert.equal(result.cameraAvoidanceStatus, "applied");
  assert.equal(result.avoidedCameraCount, 1);
  assert.equal(result.distanceMeters, 1200);
  assert.equal(result.primaryRoute, route);
});

test("returns the primary route with an explicit warning when camera data fails", async () => {
  const calls = [];
  const result = await routeWithCameraAvoidance(
    { start: { lat: 23.12, lon: 113.26 }, end: { lat: 23.13, lon: 113.28 }, costing: "motorcycle" },
    {
      route: async (input) => {
        calls.push(input);
        return route;
      },
      loadCameras: async () => {
        throw new Error("fixture unavailable");
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(result.cameraAvoidanceStatus, "unavailable");
  assert.equal(result.cameraAvoidanceMessage, "摄像头数据未加载，本次路线未进行摄像头避让。");
  assert.equal(result.avoidedCameraCount, 0);
  assert.equal(result.primaryRoute, route);
});

test("returns the primary route with an explicit warning when no detour exists", async () => {
  const calls = [];
  const result = await routeWithCameraAvoidance(
    { start: { lat: 23.12, lon: 113.26 }, end: { lat: 23.13, lon: 113.28 }, costing: "motorcycle" },
    {
      route: async (input) => {
        calls.push(input);
        if (calls.length === 2) throw new Error("no route after exclusion");
        return route;
      },
      loadCameras: async () => dataset,
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(result.cameraAvoidanceStatus, "failed");
  assert.equal(result.nearbyCameraCount, 1);
  assert.equal(result.avoidedCameraCount, 0);
  assert.equal(result.cameraAvoidanceMessage, "未找到最多增加 3 公里的绕行路线，当前首选路线可能经过 1 个已知摄像头。");
  assert.equal(result.primaryRoute, route);
});

test("falls back when the detour exceeds the three kilometer limit", async () => {
  const result = await routeWithCameraAvoidance(
    { start: { lat: 23.12, lon: 113.26 }, end: { lat: 23.13, lon: 113.28 }, costing: "motorcycle" },
    {
      route: async (input) => input.excludeLocations ? { ...route, distanceMeters: 4001 } : route,
      loadCameras: async () => dataset,
      maxDetourMeters: 3000,
    },
  );

  assert.equal(result.cameraAvoidanceStatus, "failed");
  assert.equal(result.nearbyCameraCount, 1);
  assert.equal(result.avoidedCameraCount, 0);
  assert.equal(result.distanceMeters, route.distanceMeters);
});

test("validates and loads a versioned camera manifest", async () => {
  const manifest = parseCameraManifest({
    version: 1,
    region: "guangzhou",
    datasetVersion: "2026-09-02-001",
    updatedAt: "2026-09-02",
    dataUrl: "https://cdn.example.test/cameras.json",
  });
  assert.equal(manifest.datasetVersion, "2026-09-02-001");
  assert.throws(
    () => parseCameraManifest({ ...manifest, dataUrl: "../cameras.json" }),
    /manifest metadata is invalid/,
  );

  const dataset = {
    version: 1,
    region: "guangzhou",
    updatedAt: "2026-09-02",
    source: "test",
    cameras: [],
  };
  const responses = new Map([
    ["https://cdn.example.test/manifest.json", { ok: true, status: 200, json: async () => ({ ...manifest, dataUrl: "https://cdn.example.test/cameras.json" }) }],
    ["https://cdn.example.test/cameras.json", { ok: true, status: 200, json: async () => dataset }],
  ]);
  const loaded = await loadCameraDatasetFromManifest(
    "https://cdn.example.test/manifest.json",
    async (url) => responses.get(url),
  );
  assert.deepEqual(loaded, dataset);
});

test("persists and restores map-picked test cameras locally", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const cameras = [{
    id: "manual-camera-1",
    name: "测试点位 1",
    lat: 23.125,
    lon: 113.27,
    type: "motorcycle-camera",
  }];

  saveLocalTestCameras(cameras, storage);
  assert.deepEqual(loadLocalTestCameras(storage), cameras);
});

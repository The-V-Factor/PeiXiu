import test from "node:test";
import assert from "node:assert/strict";
import { parseCameraDataset } from "../src/restrictions/cameras.js";
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
    { id: "near", name: "近点", lat: 23.125, lon: 113.271, type: "motorcycle-camera" },
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

test("selects cameras inside the 200 meter route corridor", () => {
  assert.ok(pointToRouteDistanceMeters(dataset.cameras[0], route) < 200);
  assert.ok(pointToRouteDistanceMeters(dataset.cameras[1], route) > 200);
  assert.deepEqual(selectCamerasNearRoute(route, dataset.cameras), [dataset.cameras[0]]);
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
  assert.deepEqual(calls[1].excludeLocations, [{ lat: 23.125, lon: 113.271 }]);
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

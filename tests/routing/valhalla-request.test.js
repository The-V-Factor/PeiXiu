import test from "node:test";
import assert from "node:assert/strict";

let buildRouteRequest;
let parseRouteResponse;
try {
  ({ buildRouteRequest, parseRouteResponse } = await import("../../src/routing/valhalla/request.js"));
} catch {
  // The first RED run should fail on the missing production behavior.
}

test("builds a local motorcycle route request", () => {
  assert.equal(typeof buildRouteRequest, "function");

  assert.deepEqual(
    buildRouteRequest({
      start: { lat: 23.12, lon: 113.26 },
      end: { lat: 23.13, lon: 113.28 },
    }),
    {
      locations: [
        { lat: 23.12, lon: 113.26, type: "break" },
        { lat: 23.13, lon: 113.28, type: "break" },
      ],
      costing: "motorcycle",
      directions_type: "none",
    },
  );
});

test("normalizes a Valhalla route response", () => {
  assert.equal(typeof parseRouteResponse, "function");

  assert.deepEqual(
    parseRouteResponse({
      trip: {
        summary: { length: 12.5, time: 900 },
        legs: [{ shape: "encoded-shape" }],
      },
    }),
    {
      distanceMeters: 12500,
      durationSeconds: 900,
      geometry: "encoded-shape",
    },
  );
});

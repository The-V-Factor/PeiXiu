#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("usage: geojson-to-osmium-poly.mjs <input.geojson> <output.poly>");
  process.exit(64);
}

const value = JSON.parse(await readFile(inputPath, "utf8"));

function geometryFromGeoJson(input) {
  if (input?.type === "FeatureCollection") {
    if (!Array.isArray(input.features) || input.features.length === 0) throw new TypeError("GeoJSON feature collection is empty");
    return input.features.flatMap((feature) => geometryFromGeoJson(feature));
  }
  if (input?.type === "Feature") return geometryFromGeoJson(input.geometry);
  if (input?.type === "Polygon") return [input.coordinates];
  if (input?.type === "MultiPolygon") return input.coordinates;
  throw new TypeError("GeoJSON must contain Polygon or MultiPolygon geometry");
}

function validateRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every((position) =>
    Array.isArray(position) && position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]))) {
    throw new TypeError("GeoJSON contains an invalid polygon ring");
  }
}

const polygons = geometryFromGeoJson(value);
const sections = ["广州行政边界"];

polygons.forEach((rings, polygonIndex) => {
  if (!Array.isArray(rings) || rings.length === 0) throw new TypeError("GeoJSON polygon has no rings");
  rings.forEach(validateRing);
  rings.forEach((ring, ringIndex) => {
    const prefix = ringIndex === 0 ? "" : "!";
    const name = `${prefix}广州-${polygonIndex + 1}-${ringIndex + 1}`;
    sections.push(name, ring.map(([lon, lat]) => `${lon} ${lat}`).join("\n"), "END");
  });
});

sections.push("END", "");
await writeFile(outputPath, sections.join("\n"));

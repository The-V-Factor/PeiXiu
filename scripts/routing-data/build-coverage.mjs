#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("usage: build-coverage.mjs <roads-geojson> <coverage-geojson>");
  process.exit(64);
}

const roadTypes = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
  "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
  "residential", "living_street", "service", "track", "road",
]);
const cellSize = 0.005;
const source = JSON.parse(await readFile(inputPath, "utf8"));
const cells = new Set();

function visitCoordinate(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return;
  const lon = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
  cells.add(`${Math.floor(lon / cellSize)},${Math.floor(lat / cellSize)}`);
}

function visitGeometry(geometry) {
  if (!geometry) return;
  if (geometry.type === "LineString") geometry.coordinates.forEach(visitCoordinate);
  if (geometry.type === "MultiLineString") geometry.coordinates.flat().forEach(visitCoordinate);
}

for (const feature of source.features ?? []) {
  if (roadTypes.has(feature.properties?.highway)) visitGeometry(feature.geometry);
}

const edgeMap = new Map();
function addEdge(start, end) {
  const forward = `${start[0]},${start[1]}:${end[0]},${end[1]}`;
  const reverse = `${end[0]},${end[1]}:${start[0]},${start[1]}`;
  if (edgeMap.has(reverse)) edgeMap.delete(reverse);
  else edgeMap.set(forward, { start, end });
}

for (const key of cells) {
  const [x, y] = key.split(",").map(Number);
  addEdge([x, y], [x + 1, y]);
  addEdge([x + 1, y], [x + 1, y + 1]);
  addEdge([x + 1, y + 1], [x, y + 1]);
  addEdge([x, y + 1], [x, y]);
}

const outgoing = new Map();
for (const edge of edgeMap.values()) {
  const key = `${edge.start[0]},${edge.start[1]}`;
  const edges = outgoing.get(key) ?? [];
  edges.push(edge);
  outgoing.set(key, edges);
}

function simplify(ring) {
  const result = [];
  for (const point of ring) {
    const previous = result.at(-1);
    const beforePrevious = result.at(-2);
    const sameColumn = beforePrevious?.[0] === previous?.[0] && previous?.[0] === point[0];
    const sameRow = beforePrevious?.[1] === previous?.[1] && previous?.[1] === point[1];
    if (sameColumn || sameRow) result.pop();
    result.push(point);
  }
  return result;
}

const rings = [];
while (edgeMap.size > 0) {
  const first = edgeMap.values().next().value;
  const ring = [first.start];
  let edge = first;
  do {
    edgeMap.delete(`${edge.start[0]},${edge.start[1]}:${edge.end[0]},${edge.end[1]}`);
    ring.push(edge.end);
    const nextEdges = outgoing.get(`${edge.end[0]},${edge.end[1]}`) ?? [];
    edge = nextEdges.find((candidate) => edgeMap.has(`${candidate.start[0]},${candidate.start[1]}:${candidate.end[0]},${candidate.end[1]}`));
  } while (edge && (edge.end[0] !== ring[0][0] || edge.end[1] !== ring[0][1]));
  const simplified = simplify(ring);
  if (simplified.length >= 4) rings.push(simplified);
}

const features = rings.map((ring) => ({
  type: "Feature",
  properties: { source: "osm-highway", cellSizeDegrees: cellSize },
  geometry: {
    type: "Polygon",
    coordinates: [ring.map(([x, y]) => [x * cellSize, y * cellSize])],
  },
}));

await writeFile(outputPath, `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`);
console.log(`generated ${features.length} coverage cells from ${cells.size} road cells`);

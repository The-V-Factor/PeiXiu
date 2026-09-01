#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

const [routingDirectory, graphVersion, west, south, east, north, sourcePbf] = process.argv.slice(2);

if (!routingDirectory || !graphVersion || !west || !south || !east || !north || !sourcePbf) {
  console.error("usage: generate-manifest.mjs <graph-directory> <graph-version> <west> <south> <east> <north> <source-pbf>");
  process.exit(64);
}

const bounds = {
  west: Number(west),
  south: Number(south),
  east: Number(east),
  north: Number(north),
};

if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) || bounds.west >= bounds.east || bounds.south >= bounds.north) {
  throw new Error("route bounds must be finite and ordered west < east, south < north");
}

async function listGraphFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listGraphFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".gph")) files.push(path);
  }

  return files;
}

const tileLayouts = new Map([
  [0, { size: 4, width: 90 }],
  [1, { size: 1, width: 360 }],
  [2, { size: 0.25, width: 1440 }],
]);

function boundsForTile(tileId) {
  const parts = tileId.split("/");
  const level = Number(parts[0]);
  const layout = tileLayouts.get(level);
  if (!layout || parts.length < 2 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`unsupported Valhalla tile id: ${tileId}`);
  }
  const tileIndex = Number(parts.slice(1).join(""));
  if (!Number.isSafeInteger(tileIndex)) throw new Error(`invalid Valhalla tile id: ${tileId}`);
  const row = Math.floor(tileIndex / layout.width);
  const column = tileIndex % layout.width;
  const west = column * layout.size - 180;
  const south = row * layout.size - 90;
  return { west, south, east: west + layout.size, north: south + layout.size };
}

function sha256(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const graphFiles = (await listGraphFiles(routingDirectory)).sort();
if (graphFiles.length === 0) throw new Error(`no .gph files found in ${routingDirectory}`);

const tiles = await Promise.all(graphFiles.map(async (path) => {
  const relativePath = relative(routingDirectory, path).split(sep).join("/");
  const fileStats = await stat(path);
  return {
    tileId: relativePath.slice(0, -4),
    path: relativePath,
    bounds: boundsForTile(relativePath.slice(0, -4)),
    sizeBytes: fileStats.size,
    sha256: await sha256(path),
  };
}));

const manifest = {
  region: "guangzhou",
  graphVersion,
  tileFormat: "valhalla-gph",
  baseUrl: process.env.ROUTING_BASE_URL || `/routing/guangzhou/${graphVersion}`,
  generatedAt: new Date().toISOString(),
  ...(process.env.ROUTING_BOUNDARY_URL ? { boundaryUrl: process.env.ROUTING_BOUNDARY_URL } : {}),
  ...(process.env.ROUTING_COVERAGE_URL ? { coverageUrl: process.env.ROUTING_COVERAGE_URL } : {}),
  source: {
    kind: "osm-pbf",
    url: process.env.OSM_PBF_URL || "https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf",
    downloadedAt: process.env.OSM_PBF_DOWNLOADED_AT || null,
    osmPbfSha256: await sha256(sourcePbf),
    clipBounds: bounds,
    tileBuilder: process.env.VALHALLA_IMAGE || "ghcr.io/gis-ops/docker-valhalla/valhalla:latest",
  },
  tiles,
};

await mkdir(dirname(join(routingDirectory, "manifest.json")), { recursive: true });
await writeFile(join(routingDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

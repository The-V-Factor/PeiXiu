const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function isBounds(value) {
  return (
    value &&
    Number.isFinite(value.west) &&
    Number.isFinite(value.south) &&
    Number.isFinite(value.east) &&
    Number.isFinite(value.north) &&
    value.west >= -180 &&
    value.east <= 180 &&
    value.west < value.east &&
    value.south >= -90 &&
    value.north <= 90 &&
    value.south < value.north
  );
}

function isSafeRelativePath(value) {
  return isNonEmptyString(value) && !value.startsWith("/") && !value.split("/").includes("..");
}

function isDataUrl(value) {
  if (!isNonEmptyString(value)) return false;
  if (!value.includes("://")) return !value.split("/").includes("..");
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function optionalDataUrl(value, fieldName) {
  if (value === undefined) return {};
  if (!isDataUrl(value)) throw new TypeError(`Routing manifest ${fieldName.replace("Url", " URL")} is invalid`);
  return { [fieldName]: value };
}

export function parseRoutingManifest(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Routing manifest must be an object");
  }

  if (
    !isNonEmptyString(value.region) ||
    !isNonEmptyString(value.graphVersion) ||
    value.tileFormat !== "valhalla-gph" ||
    !isNonEmptyString(value.baseUrl) ||
    !isNonEmptyString(value.generatedAt) ||
    !Array.isArray(value.tiles) ||
    value.tiles.length === 0
  ) {
    throw new TypeError("Routing manifest metadata is invalid");
  }

  const tiles = value.tiles.map((tile) => {
    if (!tile || !isNonEmptyString(tile.tileId) || !isSafeRelativePath(tile.path) || !isBounds(tile.bounds)) {
      throw new TypeError("Routing manifest contains an invalid tile");
    }

    return {
      tileId: tile.tileId,
      path: tile.path,
      bounds: { ...tile.bounds },
      ...(tile.sizeBytes === undefined ? {} : { sizeBytes: tile.sizeBytes }),
      ...(tile.sha256 === undefined ? {} : { sha256: tile.sha256 }),
    };
  });

  return {
    region: value.region,
    graphVersion: value.graphVersion,
    tileFormat: "valhalla-gph",
    baseUrl: value.baseUrl,
    generatedAt: value.generatedAt,
    tiles,
    ...optionalDataUrl(value.boundaryUrl, "boundaryUrl"),
    ...optionalDataUrl(value.coverageUrl, "coverageUrl"),
    ...(value.source === undefined ? {} : { source: value.source }),
  };
}

export async function loadRoutingManifest(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Routing manifest request failed: HTTP ${response.status}`);
  }
  return parseRoutingManifest(await response.json());
}

export function selectTilesForRoute(manifest, input) {
  const west = Math.min(input.start.lon, input.end.lon);
  const east = Math.max(input.start.lon, input.end.lon);
  const south = Math.min(input.start.lat, input.end.lat);
  const north = Math.max(input.start.lat, input.end.lat);

  return manifest.tiles.filter(({ bounds }) =>
    bounds.west <= east && bounds.east >= west && bounds.south <= north && bounds.north >= south,
  );
}

export function resolveTileUrl(manifest, tile) {
  const baseUrl = manifest.baseUrl.replace(/\/+$/, "");
  return `${baseUrl}/${tile.path.replace(/^\/+/, "")}`;
}

const GEOMETRY_TYPES = new Set(["Polygon", "MultiPolygon"]);

function isPosition(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function isRing(value) {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function parsePolygonCoordinates(value) {
  if (!Array.isArray(value) || !value.every(isRing)) {
    throw new TypeError("GeoJSON polygon coordinates are invalid");
  }
  return value.map((ring) => ring.map(([lon, lat]) => [lon, lat]));
}

export function parseGeoJsonGeometry(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("GeoJSON geometry must be an object");
  }

  if (value.type === "Feature") return parseGeoJsonGeometry(value.geometry);
  if (value.type === "FeatureCollection") {
    if (!Array.isArray(value.features) || value.features.length === 0) {
      throw new TypeError("GeoJSON feature collection is empty");
    }
    return {
      type: "GeometryCollection",
      geometries: value.features.map((feature) => parseGeoJsonGeometry(feature)),
    };
  }
  if (value.type === "GeometryCollection") {
    if (!Array.isArray(value.geometries) || value.geometries.length === 0) {
      throw new TypeError("GeoJSON geometry collection is empty");
    }
    return {
      type: "GeometryCollection",
      geometries: value.geometries.map((geometry) => parseGeoJsonGeometry(geometry)),
    };
  }
  if (!GEOMETRY_TYPES.has(value.type)) {
    throw new TypeError("GeoJSON must contain Polygon or MultiPolygon geometry");
  }

  if (value.type === "Polygon") {
    return { type: "Polygon", coordinates: parsePolygonCoordinates(value.coordinates) };
  }

  if (!Array.isArray(value.coordinates) || value.coordinates.length === 0) {
    throw new TypeError("GeoJSON multipolygon coordinates are invalid");
  }
  return {
    type: "MultiPolygon",
    coordinates: value.coordinates.map(parsePolygonCoordinates),
  };
}

export function geometryPolygons(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return geometry.geometries.flatMap(geometryPolygons);
}

export function geometryBounds(geometry) {
  const positions = geometryPolygons(geometry).flat(2);
  if (positions.length === 0) throw new TypeError("GeoJSON geometry is empty");
  return positions.reduce((bounds, [lon, lat]) => ({
    west: Math.min(bounds.west, lon),
    south: Math.min(bounds.south, lat),
    east: Math.max(bounds.east, lon),
    north: Math.max(bounds.north, lat),
  }), {
    west: positions[0][0],
    south: positions[0][1],
    east: positions[0][0],
    north: positions[0][1],
  });
}

function pointInRing({ lon, lat }, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLon, currentLat] = ring[index];
    const [previousLon, previousLat] = ring[previous];
    const intersects = ((currentLat > lat) !== (previousLat > lat)) &&
      lon < (previousLon - currentLon) * (lat - currentLat) / (previousLat - currentLat) + currentLon;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon([outerRing, ...holes], coordinate) {
  return pointInRing(coordinate, outerRing) && holes.every((hole) => !pointInRing(coordinate, hole));
}

export function pointInGeometry(coordinate, geometry) {
  return geometryPolygons(geometry).some((polygon) => pointInPolygon(polygon, coordinate));
}

export async function loadGeoJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`GeoJSON request failed: HTTP ${response.status}`);
  return parseGeoJsonGeometry(await response.json());
}

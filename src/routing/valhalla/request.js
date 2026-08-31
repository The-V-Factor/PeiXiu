const isCoordinate = (value) =>
  value && Number.isFinite(value.lat) && Number.isFinite(value.lon);

export function buildRouteRequest({ start, end, excludeLocations = [] }) {
  if (!isCoordinate(start) || !isCoordinate(end)) {
    throw new TypeError("start and end must contain finite lat/lon coordinates");
  }

  if (!excludeLocations.every(isCoordinate)) {
    throw new TypeError("excludeLocations must contain finite lat/lon coordinates");
  }

  return {
    locations: [
      { lat: start.lat, lon: start.lon, type: "break" },
      { lat: end.lat, lon: end.lon, type: "break" },
    ],
    costing: "motorcycle",
    directions_type: "none",
    ...(excludeLocations.length > 0 ? { exclude_locations: excludeLocations } : {}),
  };
}

export function parseRouteResponse(response) {
  const summary = response?.trip?.summary;
  const geometry = response?.trip?.legs?.[0]?.shape;

  if (!summary || !Number.isFinite(summary.length) || !Number.isFinite(summary.time) || !geometry) {
    throw new TypeError("Valhalla response is missing route summary or geometry");
  }

  return {
    distanceMeters: summary.length * 1000,
    durationSeconds: summary.time,
    geometry,
  };
}

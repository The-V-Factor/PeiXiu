const EARTH_RADIUS_METERS = 6_378_008.8;

function projectCoordinate(coordinate, origin) {
  const latScale = (Math.PI / 180) * EARTH_RADIUS_METERS;
  const lonScale = latScale * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (coordinate[0] - origin.lon) * lonScale,
    y: (coordinate[1] - origin.lat) * latScale,
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

export function pointToRouteDistanceMeters(point, route) {
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new TypeError("Route geometry must contain coordinates");
  }

  const projectedPoint = { x: 0, y: 0 };
  const projected = coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
      throw new TypeError("Route geometry contains an invalid coordinate");
    }
    return projectCoordinate(coordinate, point);
  });

  if (projected.length === 1) return Math.hypot(projected[0].x, projected[0].y);

  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < projected.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(projectedPoint, projected[index - 1], projected[index]));
  }
  return nearest;
}

export function selectCamerasNearRoute(route, cameras, corridorMeters = 200) {
  if (!Number.isFinite(corridorMeters) || corridorMeters < 0) {
    throw new RangeError("corridorMeters must be a non-negative finite number");
  }

  return cameras.filter((camera) => pointToRouteDistanceMeters(camera, route) <= corridorMeters);
}

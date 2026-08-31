type Coordinate = {
  lat: number;
  lon: number;
};

type RouteRequest = {
  start: Coordinate;
  end: Coordinate;
  excludeLocations?: Coordinate[];
};

export function buildRouteRequest(input: RouteRequest): {
  locations: Array<Coordinate & { type: "break" }>;
  costing: "motorcycle";
  directions_type: "none";
  exclude_locations?: Coordinate[];
};

export function parseRouteResponse(response: unknown): {
  distanceMeters: number;
  durationSeconds: number;
  geometry: string;
};

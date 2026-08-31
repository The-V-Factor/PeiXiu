export type Coordinate = {
  lat: number;
  lon: number;
};

export type RouteInput = {
  start: Coordinate;
  end: Coordinate;
  costing: "motorcycle";
  excludeLocations?: Coordinate[];
};

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
  avoidedCameraCount: number;
};

export interface RoutingEngine {
  init(): Promise<void>;
  route(input: RouteInput): Promise<RouteResult>;
  clearCache(): Promise<void>;
}

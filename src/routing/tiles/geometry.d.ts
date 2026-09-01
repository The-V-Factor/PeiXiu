import type { TileBounds } from "./types.js";

export type GeoJsonPosition = [number, number];
export type GeoJsonPolygon = { type: "Polygon"; coordinates: GeoJsonPosition[][] };
export type GeoJsonMultiPolygon = { type: "MultiPolygon"; coordinates: GeoJsonPosition[][][] };
export type GeoJsonGeometryCollection = { type: "GeometryCollection"; geometries: GeoJsonGeometry[] };
export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon | GeoJsonGeometryCollection;

export function parseGeoJsonGeometry(value: unknown): GeoJsonGeometry;
export function geometryPolygons(geometry: GeoJsonGeometry): GeoJsonPosition[][][];
export function geometryBounds(geometry: GeoJsonGeometry): TileBounds;
export function pointInGeometry(coordinate: { lat: number; lon: number }, geometry: GeoJsonGeometry): boolean;
export function loadGeoJson(url: string, fetchImpl?: typeof fetch): Promise<GeoJsonGeometry>;

import { parseTarIndex, type TileSource } from "valhalla-wasm";
import { buildRouteRequest } from "./request.js";
import type { RouteInput, RouteResult } from "../types.js";
import { RoutingError } from "../errors.js";
import type { TileSourceFactory } from "../tiles/types.js";

type ValhallaModule = {
  FS: any;
  ValhallaRouter: new (config: string) => {
    route(request: string): string;
  };
};

const valhallaConfig = {
  mjolnir: {
    tile_dir: "/valhalla_tiles",
    include_bicycle: false,
    include_driving: true,
    include_pedestrian: false,
    use_lru_mem_cache: true,
    lru_mem_cache_hard_control: false,
    max_cache_size: 209715200,
    hierarchy: true,
    logging: { color: false, type: "" },
  },
  loki: {
    actions: ["locate", "route"],
    logging: { color: false, type: "" },
    service_defaults: {
      heading_tolerance: 60,
      minimum_reachability: 10,
      node_snap_tolerance: 50,
      radius: 0,
      search_cutoff: 35000,
      mvt_min_zoom_road_class: [6, 7, 8, 9, 10, 11, 12, 13],
      mvt_min_zoom_other: [6, 7, 8, 9, 10, 11, 12, 13],
      mvt_min_zoom_path: [6, 7, 8, 9, 10, 11, 12, 13],
      mvt_cache_min_zoom: 12,
      mvt_cache_max_zoom: 16,
      mvt_cache_size: 100,
      street_side_max_distance: 1000,
      street_side_tolerance: 5,
    },
  },
  costing_options: {
    motorcycle: {},
  },
  thor: {
    source_to_target_algorithm: "select_optimal",
    service: { proxy: "ipc:///tmp/thor" },
  },
  odin: {
    logging: { color: false, type: "" },
    service: { proxy: "ipc:///tmp/odin" },
  },
  meili: {
    mode: "auto",
    grid: { cache_size: 100240, size: 500 },
    logging: { color: false, type: "" },
    default: {
      beta: 3,
      breakage_distance: 2000,
      geometry: false,
      gps_accuracy: 5,
      interpolation_distance: 10,
      max_route_distance_factor: 5,
      max_route_time_factor: 5,
      max_search_radius: 100,
      route: true,
      search_radius: 50,
      sigma_z: 4.07,
      turn_penalty_factor: 0,
    },
  },
  service_limits: {
    auto: { max_distance: 5000000, max_locations: 20, max_matrix_distance: 400000, max_matrix_location_pairs: 2500 },
    bicycle: { max_distance: 500000, max_locations: 50, max_matrix_distance: 200000, max_matrix_location_pairs: 2500 },
    motorcycle: { max_distance: 5000000, max_locations: 20, max_matrix_distance: 400000, max_matrix_location_pairs: 2500 },
    pedestrian: { max_distance: 5000000, max_locations: 50, max_matrix_distance: 200000, max_matrix_location_pairs: 2500, max_transit_walking_distance: 10000, min_transit_walking_distance: 1 },
    truck: { max_distance: 5000000, max_locations: 20, max_matrix_distance: 400000, max_matrix_location_pairs: 2500 },
    isochrone: { max_contours: 4, max_distance: 25000, max_time_contour: 3600, max_distance_contour: 25000, max_locations: 1 },
    trace: { max_alternates: 3, max_alternates_shape: 100, max_distance: 200000, max_gps_accuracy: 100, max_search_radius: 100, max_shape: 16000 },
    skadi: { max_shape: 750000, min_resample: 10 },
    status: { allow_verbose: false },
    centroid: { max_distance: 200000, max_locations: 5 },
    max_alternates: 2,
    max_radius: 200,
    max_reachability: 50,
    max_exclude_locations: 50,
    max_exclude_polygons_length: 10000,
    max_timedep_distance: 500000,
    max_timedep_distance_matrix: 0,
    max_distance_disable_hierarchy_culling: 0,
  },
};

const mkdirp = (fs: any, path: string) => {
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current += `/${part}`;
    try {
      fs.mkdir(current);
    } catch (_error) {
      // The directory may already exist.
    }
  }
};

function mountTileSource(fs: any, source: TileSource, mountedTiles: Set<string>) {
  const major = Date.now() % 200 + 80;
  let minor = 0;

  const operations = {
    open(stream: any) {
      stream.seekable = true;
      stream._tileOffset = stream.node._tileOffset;
      stream._tileSize = stream.node._tileSize;
    },
    read(stream: any, buffer: Uint8Array, offset: number, length: number, position: number) {
      const remaining = stream._tileSize - position;
      if (remaining <= 0) return 0;
      const size = Math.min(length, remaining);
      const target = buffer.subarray(offset, offset + size);
      return source.read(target, stream._tileOffset + position, size);
    },
    write() {
      throw new Error("Valhalla routing tiles are read-only.");
    },
    llseek(stream: any, offset: number, whence: number) {
      let position = offset;
      if (whence === 1) position += stream.position;
      if (whence === 2) position += stream._tileSize;
      if (position < 0) throw new fs.ErrnoError(28);
      return position;
    },
  };

  for (const entry of source.entries) {
    const cleanName = entry.name.replace(/^\.\//, "");
    if (mountedTiles.has(cleanName)) continue;
    const filePath = `/valhalla_tiles/${cleanName}`;
    mkdirp(fs, filePath.slice(0, filePath.lastIndexOf("/")));
    const device = fs.makedev(major, minor++);
    fs.registerDevice(device, operations);
    fs.mkdev(filePath, 0o644, device);
    const node = fs.lookupPath(filePath).node;
    node.mode = 0o100644;
    node.usedBytes = entry.size;
    node.size = entry.size;
    node._tileOffset = entry.offset;
    node._tileSize = entry.size;
    mountedTiles.add(cleanName);
  }
}

function decodePolyline(encoded: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lon / 1e6, lat / 1e6]);
  }

  return coordinates;
}

function normalizeRoute(response: string): RouteResult {
  const parsed = JSON.parse(response);
  if (parsed.error) throw new Error(parsed.error);

  const trip = parsed.trip;
  const summary = trip?.summary;
  const shape = trip?.legs?.[0]?.shape;
  if (!summary || !Number.isFinite(summary.length) || !Number.isFinite(summary.time) || !shape) {
    throw new TypeError("Valhalla response is missing route summary or geometry");
  }

  return {
    distanceMeters: summary.length * 1000,
    durationSeconds: summary.time,
    geometry: {
      type: "LineString",
      coordinates: decodePolyline(shape),
    },
    avoidedCameraCount: 0,
  };
}

export function createBufferTileSource(buffer: ArrayBuffer): TileSource {
  const bytes = new Uint8Array(buffer);
  const read = (target: Uint8Array, offset: number, length: number) => {
    const size = Math.max(0, Math.min(length, bytes.length - offset));
    if (size > 0) target.set(bytes.subarray(offset, offset + size));
    return size;
  };

  return { entries: parseTarIndex(read, bytes.length), read };
}

export function createMotorcycleRoutingEngine(options: {
  initModule: () => Promise<ValhallaModule>;
  tileSourceFactory: TileSourceFactory;
  onProgress?: (message: string) => void;
}) {
  let module: ValhallaModule | null = null;
  let moduleLoadPromise: Promise<ValhallaModule> | null = null;
  let router: InstanceType<ValhallaModule["ValhallaRouter"]> | null = null;
  const mountedTiles = new Set<string>();

  return async (input: RouteInput, region: string): Promise<RouteResult> => {
    const modulePromise = module ?? (moduleLoadPromise ??= options.initModule().then((initialized) => {
      module = initialized;
      return initialized;
    }).catch((error) => {
      moduleLoadPromise = null;
      throw error;
    }));

    options.onProgress?.("准备本地路线引擎并加载 graph tile…");
    const sourcePromise = options.tileSourceFactory(region, input);
    let initializedModule: ValhallaModule;
    try {
      initializedModule = await modulePromise;
    } catch (error) {
      throw new RoutingError("wasm-init", error);
    }
    const source = await sourcePromise;
    if (!source) throw new Error(`未找到 graph tile: ${region}`);

    mkdirp(initializedModule.FS, "/valhalla_tiles");
    const tileCountBefore = mountedTiles.size;
    mountTileSource(initializedModule.FS, source, mountedTiles);
    if (!router || mountedTiles.size > tileCountBefore) {
      router = new initializedModule.ValhallaRouter(JSON.stringify(valhallaConfig));
    }

    options.onProgress?.("计算 motorcycle 路线…");
    const request = buildRouteRequest(input);
    return normalizeRoute(router.route(JSON.stringify({ ...request, units: "kilometers" })));
  };
}

import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./main.css";
import { loadCameraDataset } from "./restrictions/cameras.js";
import type { CameraAwareRouteResult, CameraDataset } from "./restrictions/types.js";
import type { Coordinate } from "./routing/types.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing application root");
}

app.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">PEIXIU · LOCAL ROUTING</p>
        <h1>广州摩托导航</h1>
        <p class="subtitle">在浏览器本地计算路线，辅助查看已知摄像头点位。</p>
      </div>
      <a class="text-link" href="/spike/valhalla-route.html">打开技术 Spike</a>
    </header>

    <main class="workspace">
      <section class="map-panel" aria-label="广州地图">
        <div id="map" class="map"></div>
        <div class="map-hint">点击地图设置目的地；尚未定位时，第一次点击设置起点。</div>
      </section>

      <aside class="control-panel">
        <div class="panel-heading">
          <p class="eyebrow">ROUTE PLANNER</p>
          <h2>规划一条路线</h2>
        </div>

        <div class="point-list">
          <div class="point-row">
            <span class="point-dot point-start">起</span>
            <div>
              <span class="point-label">起点</span>
              <strong id="start-label">等待定位或地图选点</strong>
            </div>
          </div>
          <div class="point-row">
            <span class="point-dot point-end">终</span>
            <div>
              <span class="point-label">目的地</span>
              <strong id="end-label">点击地图选择</strong>
            </div>
          </div>
        </div>

        <div class="actions">
          <button id="locate" class="button button-secondary" type="button">使用当前位置</button>
          <button id="route" class="button button-primary" type="button">规划路线</button>
          <button id="clear" class="button button-quiet" type="button">清除目的地</button>
        </div>

        <label class="check-row">
          <input id="avoid-cameras" type="checkbox" checked />
          <span>启用已知摄像头避让</span>
        </label>

        <div class="status-card" aria-live="polite">
          <span class="status-dot"></span>
          <span id="status">准备就绪。请先定位或在地图上选择起点。</span>
        </div>

        <div class="metrics" aria-label="路线指标">
          <div class="metric"><span>距离</span><strong id="distance">—</strong></div>
          <div class="metric"><span>预计时间</span><strong id="duration">—</strong></div>
          <div class="metric"><span>避开点位</span><strong id="avoided">—</strong></div>
        </div>

        <div class="data-status">
          <span>摄像头数据</span>
          <strong id="camera-status">加载中…</strong>
        </div>

        <p class="disclaimer">路线仅供辅助参考。摄像头点位可能存在延迟、遗漏或变更，请以实际道路标志和交通法规为准。</p>
      </aside>
    </main>
  </div>
`;

const mapElement = document.querySelector<HTMLDivElement>("#map");
const statusElement = document.querySelector<HTMLSpanElement>("#status")!;
const cameraStatusElement = document.querySelector<HTMLElement>("#camera-status")!;
const startLabel = document.querySelector<HTMLElement>("#start-label")!;
const endLabel = document.querySelector<HTMLElement>("#end-label")!;
const distanceElement = document.querySelector<HTMLElement>("#distance")!;
const durationElement = document.querySelector<HTMLElement>("#duration")!;
const avoidedElement = document.querySelector<HTMLElement>("#avoided")!;
const locateButton = document.querySelector<HTMLButtonElement>("#locate")!;
const routeButton = document.querySelector<HTMLButtonElement>("#route")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear")!;
const avoidCamerasInput = document.querySelector<HTMLInputElement>("#avoid-cameras")!;

if (!mapElement || !statusElement || !cameraStatusElement || !startLabel || !endLabel || !distanceElement || !durationElement || !avoidedElement || !locateButton || !routeButton || !clearButton || !avoidCamerasInput) {
  throw new Error("Missing route planner element");
}

const mapStyle = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

const map = new MapLibreMap({
  container: mapElement,
  style: mapStyle,
  center: [113.2644, 23.1291],
  zoom: 12,
  maxZoom: 18,
});
map.addControl(new NavigationControl(), "top-right");

const routeData = { type: "FeatureCollection", features: [] as Array<Record<string, unknown>> };
let cameraData: CameraDataset | null = null;
let start: Coordinate | null = null;
let end: Coordinate | null = null;
let startMarker: MapLibreMarker | null = null;
let endMarker: MapLibreMarker | null = null;
let currentMarker: MapLibreMarker | null = null;
let routing = false;

function setStatus(message: string) {
  statusElement.textContent = message;
}

function formatCoordinate(coordinate: Coordinate) {
  return `${coordinate.lat.toFixed(5)}, ${coordinate.lon.toFixed(5)}`;
}

function createMarkerElement(kind: string) {
  const element = document.createElement("div");
  element.className = `map-marker map-marker-${kind}`;
  const label = kind === "current" ? "" : kind === "start" ? "起" : "终";
  if (label) element.innerHTML = `<span>${label}</span>`;
  return element;
}

function setStart(coordinate: Coordinate) {
  start = coordinate;
  startMarker?.remove();
  startMarker = new MapLibreMarker({ element: createMarkerElement("start") }).setLngLat([coordinate.lon, coordinate.lat]).addTo(map);
  startLabel.textContent = formatCoordinate(coordinate);
}

function setEnd(coordinate: Coordinate) {
  end = coordinate;
  endMarker?.remove();
  endMarker = new MapLibreMarker({ element: createMarkerElement("end") }).setLngLat([coordinate.lon, coordinate.lat]).addTo(map);
  endLabel.textContent = formatCoordinate(coordinate);
}

function setCurrentLocation(coordinate: Coordinate) {
  currentMarker?.remove();
  currentMarker = new MapLibreMarker({ element: createMarkerElement("current") }).setLngLat([coordinate.lon, coordinate.lat]).addTo(map);
  if (!start) setStart(coordinate);
}

function setRouteData(result: CameraAwareRouteResult | null) {
  routeData.features = [];
  if (result) {
    const primaryRoute = result.primaryRoute ?? result;
    routeData.features.push({ type: "Feature", properties: { kind: "primary" }, geometry: primaryRoute.geometry });
    routeData.features.push({ type: "Feature", properties: { kind: "final" }, geometry: result.geometry });
  }
  const source = map.getSource("routes") as GeoJSONSource | undefined;
  source?.setData(routeData as never);
}

function setCameraData(dataset: CameraDataset) {
  cameraData = dataset;
  const source = map.getSource("cameras") as GeoJSONSource | undefined;
  source?.setData({
    type: "FeatureCollection",
    features: dataset.cameras.map((camera) => ({
      type: "Feature",
      properties: { id: camera.id, name: camera.name, type: camera.type },
      geometry: { type: "Point", coordinates: [camera.lon, camera.lat] },
    })),
  } as never);
  cameraStatusElement.textContent = `${dataset.cameras.length} 个已知点位`;
}

function clearRoute() {
  setRouteData(null);
  distanceElement.textContent = "—";
  durationElement.textContent = "—";
  avoidedElement.textContent = "—";
}

function requestLocation() {
  if (!navigator.geolocation) {
    setStatus("当前浏览器不支持定位，请点击地图设置起点。");
    return;
  }

  setStatus("正在请求当前位置…");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const coordinate = { lat: coords.latitude, lon: coords.longitude };
      setCurrentLocation(coordinate);
      setStatus("已取得当前位置，请点击地图选择目的地。");
    },
    (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? "定位权限被拒绝，请点击地图设置起点。"
        : error.code === error.TIMEOUT
          ? "定位请求超时，请重试或点击地图设置起点。"
          : "暂时无法取得当前位置，请点击地图设置起点。";
      setStatus(message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

function showResult(result: CameraAwareRouteResult) {
  setRouteData(result);
  distanceElement.textContent = `${Math.round(result.distanceMeters).toLocaleString()} m`;
  durationElement.textContent = `${Math.max(1, Math.round(result.durationSeconds / 60))} 分钟`;
  avoidedElement.textContent = `${result.avoidedCameraCount} 个`;

  if (result.cameraAvoidanceMessage) {
    setStatus(result.cameraAvoidanceMessage);
  } else if (result.cameraAvoidanceStatus === "applied") {
    setStatus(`路线计算成功，已避开 ${result.avoidedCameraCount} 个已知点位。`);
  } else if (result.cameraAvoidanceStatus === "not-needed") {
    setStatus("路线计算成功，路线走廊内没有已知摄像头点位。");
  } else {
    setStatus("路线计算成功。");
  }
}

const worker = new Worker(new URL("./routing/valhalla/worker.ts", import.meta.url));
worker.addEventListener("message", ({ data }) => {
  if (data.type === "progress") {
    setStatus(data.message);
  } else if (data.type === "debug") {
    setStatus("本地路线引擎正在工作…");
  } else if (data.type === "result") {
    routing = false;
    routeButton.disabled = false;
    showResult(data.result as CameraAwareRouteResult);
  } else if (data.type === "error") {
    routing = false;
    routeButton.disabled = false;
    setStatus(`${data.message}${data.retryable ? " 可点击“规划路线”重试。" : " 请重新选择地点。"}`);
  }
});
worker.addEventListener("error", ({ message }) => {
  routing = false;
  routeButton.disabled = false;
  setStatus("本地路线 Worker 启动失败，请刷新页面后重试。");
});

map.on("load", () => {
  map.addSource("routes", { type: "geojson", data: routeData as never });
  map.addLayer({
    id: "route-primary",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "kind"], "primary"],
    paint: { "line-color": "#64748b", "line-width": 4, "line-dasharray": [2, 2], "line-opacity": 0.75 },
  });
  map.addLayer({
    id: "route-final",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "kind"], "final"],
    paint: { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.95 },
  });
  map.addSource("cameras", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "camera-points",
    type: "circle",
    source: "cameras",
    paint: { "circle-radius": 6, "circle-color": "#e11d48", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
  if (cameraData) setCameraData(cameraData);
});

map.on("click", (event: MapMouseEvent) => {
  const coordinate = { lat: event.lngLat.lat, lon: event.lngLat.lng };
  if (!start) {
    setStart(coordinate);
    setStatus("已设置起点，请继续点击地图选择目的地。");
  } else {
    setEnd(coordinate);
    clearRoute();
    setStatus("已设置目的地，可以开始规划路线。");
  }
});

locateButton.addEventListener("click", requestLocation);
clearButton.addEventListener("click", () => {
  end = null;
  endMarker?.remove();
  endMarker = null;
  endLabel.textContent = "点击地图选择";
  clearRoute();
  setStatus(start ? "已清除目的地，请点击地图重新选择。" : "已清除选点，请先定位或点击地图设置起点。");
});
routeButton.addEventListener("click", () => {
  if (routing) return;
  if (!start || !end) {
    setStatus("请先设置起点和目的地。");
    return;
  }

  routing = true;
  routeButton.disabled = true;
  setStatus("正在启动本地路线计算…");
  worker.postMessage({
    type: "route",
    region: "guangzhou-mini",
    input: { start, end, costing: "motorcycle" },
    avoidCameras: avoidCamerasInput.checked,
  });
});

loadCameraDataset("/cameras/guangzhou-mini.json")
  .then((dataset) => setCameraData(dataset))
  .catch(() => {
    cameraStatusElement.textContent = "加载失败，未进行避让";
  });

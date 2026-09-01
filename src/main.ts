import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./main.css";
import { registerServiceWorker } from "./pwa/register.js";
import { loadCameraDataset } from "./restrictions/cameras.js";
import type { CameraAwareRouteResult, CameraDataset, CameraPoint } from "./restrictions/types.js";
import type { Coordinate } from "./routing/types.js";
import { loadRoutingManifest } from "./routing/tiles/manifest.js";
import type { RoutingManifest, TileBounds } from "./routing/tiles/types.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing application root");
}

registerServiceWorker();

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
        <svg id="scope-overlay" class="scope-overlay" aria-hidden="true"></svg>
        <div class="scope-legend">
          <span class="scope-legend-swatch"></span><span>当前 graph 范围</span>
          <span class="camera-legend-swatch">摄</span><span>已知摄像头</span>
        </div>
        <div class="map-hint">点击地图设置目的地；尚未定位时，第一次点击设置起点。蓝色虚线为当前路网范围。</div>
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
          <span>路网范围</span>
          <strong id="scope-status">加载中…</strong>
        </div>

        <div class="data-status">
          <span>路网性质</span>
          <strong id="graph-status">加载中…</strong>
        </div>

        <div class="data-status">
          <span>摄像头数据</span>
          <strong id="camera-status">加载中…</strong>
        </div>

        <details class="camera-editor">
          <summary>添加测试摄像头</summary>
          <form id="camera-form" class="camera-form">
            <label>名称（可选）<input id="camera-name" type="text" placeholder="手动测试点位" /></label>
            <label>纬度<input id="camera-lat" type="number" step="0.00001" min="-90" max="90" required placeholder="23.12500" /></label>
            <label>经度<input id="camera-lon" type="number" step="0.00001" min="-180" max="180" required placeholder="113.27000" /></label>
            <div class="camera-form-actions">
              <button class="button button-secondary" type="submit">添加到地图</button>
              <button id="clear-test-cameras" class="button button-quiet" type="button">清除手动点</button>
            </div>
          </form>
          <p class="field-hint">手动点只在当前页面生效，会参与本次路线避让测试，不会修改项目数据。</p>
        </details>

        <p class="disclaimer">路线仅供辅助参考。摄像头点位可能存在延迟、遗漏或变更，请以实际道路标志和交通法规为准。</p>
      </aside>
    </main>
  </div>
`;

const mapElement = document.querySelector<HTMLDivElement>("#map");
const statusElement = document.querySelector<HTMLSpanElement>("#status")!;
const scopeStatusElement = document.querySelector<HTMLElement>("#scope-status")!;
const graphStatusElement = document.querySelector<HTMLElement>("#graph-status")!;
const scopeOverlayElement = document.querySelector<SVGSVGElement>("#scope-overlay")!;
const cameraStatusElement = document.querySelector<HTMLElement>("#camera-status")!;
const cameraForm = document.querySelector<HTMLFormElement>("#camera-form")!;
const cameraNameInput = document.querySelector<HTMLInputElement>("#camera-name")!;
const cameraLatInput = document.querySelector<HTMLInputElement>("#camera-lat")!;
const cameraLonInput = document.querySelector<HTMLInputElement>("#camera-lon")!;
const clearTestCamerasButton = document.querySelector<HTMLButtonElement>("#clear-test-cameras")!;
const startLabel = document.querySelector<HTMLElement>("#start-label")!;
const endLabel = document.querySelector<HTMLElement>("#end-label")!;
const distanceElement = document.querySelector<HTMLElement>("#distance")!;
const durationElement = document.querySelector<HTMLElement>("#duration")!;
const avoidedElement = document.querySelector<HTMLElement>("#avoided")!;
const locateButton = document.querySelector<HTMLButtonElement>("#locate")!;
const routeButton = document.querySelector<HTMLButtonElement>("#route")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear")!;
const avoidCamerasInput = document.querySelector<HTMLInputElement>("#avoid-cameras")!;

if (!mapElement || !statusElement || !scopeStatusElement || !graphStatusElement || !scopeOverlayElement || !cameraStatusElement || !cameraForm || !cameraNameInput || !cameraLatInput || !cameraLonInput || !clearTestCamerasButton || !startLabel || !endLabel || !distanceElement || !durationElement || !avoidedElement || !locateButton || !routeButton || !clearButton || !avoidCamerasInput) {
  throw new Error("Missing route planner element");
}
const mapContainer = mapElement;

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
  container: mapContainer,
  style: mapStyle,
  center: [113.2644, 23.1291],
  zoom: 12,
  maxZoom: 18,
});
map.addControl(new NavigationControl(), "top-right");

let scopeBounds: TileBounds[] = [];
let primaryRouteCoordinates: Array<[number, number]> = [];
let finalRouteCoordinates: Array<[number, number]> = [];
let cameraData: CameraDataset | null = null;
let manualCameraSequence = 0;
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
  primaryRouteCoordinates = [];
  finalRouteCoordinates = [];
  if (result) {
    const primaryRoute = result.primaryRoute ?? result;
    primaryRouteCoordinates = primaryRoute.geometry.coordinates;
    finalRouteCoordinates = result.geometry.coordinates;
  }
  renderRoutingOverlay();
}

function renderRoutingOverlay() {
  const width = mapContainer.clientWidth;
  const height = mapContainer.clientHeight;
  scopeOverlayElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
  scopeOverlayElement.setAttribute("width", String(width));
  scopeOverlayElement.setAttribute("height", String(height));
  scopeOverlayElement.replaceChildren();

  for (const bounds of scopeBounds) {
    const coordinates = [
      [bounds.west, bounds.south],
      [bounds.east, bounds.south],
      [bounds.east, bounds.north],
      [bounds.west, bounds.north],
    ];
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", coordinates.map(([lon, lat]) => {
      const point = map.project([lon, lat]);
      return `${point.x},${point.y}`;
    }).join(" "));
    scopeOverlayElement.appendChild(polygon);
  }

  for (const camera of cameraData?.cameras ?? []) {
    const point = map.project([camera.lon, camera.lat]);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("camera-point");
    group.setAttribute("aria-label", `摄像头：${camera.name}`);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(point.y));
    circle.setAttribute("r", "13");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(point.x));
    label.setAttribute("y", String(point.y));
    label.textContent = "摄";
    group.append(circle, label);
    scopeOverlayElement.appendChild(group);
  }

  for (const [className, coordinates] of [["route-primary", primaryRouteCoordinates], ["route-final", finalRouteCoordinates]] as const) {
    if (coordinates.length < 2) continue;
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.classList.add(className);
    polyline.setAttribute("points", coordinates.map(([lon, lat]) => {
      const point = map.project([lon, lat]);
      return `${point.x},${point.y}`;
    }).join(" "));
    scopeOverlayElement.appendChild(polyline);
  }
}

function setRoutingScope(manifest: RoutingManifest) {
  const seenBounds = new Set<string>();
  scopeBounds = manifest.tiles.flatMap(({ bounds }) => {
    const key = [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
    if (seenBounds.has(key)) return [];
    seenBounds.add(key);
    return [bounds];
  });
  const west = Math.min(...manifest.tiles.map(({ bounds }) => bounds.west));
  const south = Math.min(...manifest.tiles.map(({ bounds }) => bounds.south));
  const east = Math.max(...manifest.tiles.map(({ bounds }) => bounds.east));
  const north = Math.max(...manifest.tiles.map(({ bounds }) => bounds.north));
  scopeStatusElement.textContent = `${west.toFixed(3)}–${east.toFixed(3)}E / ${south.toFixed(3)}–${north.toFixed(3)}N`;
  const isSynthetic = typeof manifest.source?.osmFixture === "string";
  graphStatusElement.textContent = isSynthetic ? "合成测试路网（仅 Spike）" : "真实 OSM 路网";
  graphStatusElement.classList.toggle("status-warning", isSynthetic);

  renderRoutingOverlay();
}

function setCameraData(dataset: CameraDataset) {
  cameraData = dataset;
  renderRoutingOverlay();
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
  if (cameraData) setCameraData(cameraData);
  renderRoutingOverlay();
});
map.on("move", renderRoutingOverlay);
map.on("resize", renderRoutingOverlay);

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
    region: "guangzhou",
    input: { start, end, costing: "motorcycle" },
    avoidCameras: avoidCamerasInput.checked,
    cameras: cameraData?.cameras,
  });
});

cameraForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const lat = Number(cameraLatInput.value);
  const lon = Number(cameraLonInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    setStatus("请输入有效的摄像头纬度和经度。");
    return;
  }

  const camera: CameraPoint = {
    id: `manual-camera-${++manualCameraSequence}`,
    name: cameraNameInput.value.trim() || `手动测试点位 ${manualCameraSequence}`,
    lat,
    lon,
    type: "motorcycle-camera",
    description: "当前页面手动测试点位",
  };
  const dataset = cameraData ?? {
    version: 1 as const,
    region: "guangzhou",
    updatedAt: new Date().toISOString(),
    source: "browser-manual-test",
    cameras: [],
  };
  setCameraData({ ...dataset, source: "browser-manual-test", cameras: [...dataset.cameras, camera] });
  cameraForm.reset();
  const inScope = scopeBounds.some(({ west, south, east, north }) => lon >= west && lon <= east && lat >= south && lat <= north);
  setStatus(`已添加${camera.name}${inScope ? "，已标记在测试范围内。" : "，但该点在当前测试路网范围外。"}`);
});

clearTestCamerasButton.addEventListener("click", () => {
  if (!cameraData) return;
  setCameraData({ ...cameraData, cameras: cameraData.cameras.filter((camera) => !camera.id.startsWith("manual-camera-")) });
  setStatus("已清除手动测试摄像头，保留静态点位。");
});

loadCameraDataset("/cameras/guangzhou.json")
  .then((dataset) => setCameraData(dataset))
  .catch(() => {
    cameraStatusElement.textContent = "加载失败，未进行避让";
  });

loadRoutingManifest("/routing/guangzhou/manifest.json")
  .then((manifest) => setRoutingScope(manifest))
  .catch(() => {
    scopeStatusElement.textContent = "加载失败";
  });

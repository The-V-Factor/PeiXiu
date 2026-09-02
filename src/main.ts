import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
} from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./main.css";
import { registerServiceWorker } from "./pwa/register.js";
import { loadCameraDatasetFromManifest } from "./restrictions/cameras.js";
import { cameraManifestUrl } from "./restrictions/config.js";
import { loadLocalTestCameras, saveLocalTestCameras } from "./restrictions/local-test-cameras.js";
import type { CameraAwareRouteResult, CameraDataset, CameraPoint } from "./restrictions/types.js";
import type { Coordinate } from "./routing/types.js";
import { routingManifestUrl } from "./routing/config.js";
import { geometryPolygons, loadGeoJson, pointInGeometry, type GeoJsonGeometry } from "./routing/tiles/geometry.js";
import { loadRoutingManifest } from "./routing/tiles/manifest.js";
import type { RoutingManifest, TileBounds } from "./routing/tiles/types.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing application root");
}

registerServiceWorker();
setWorkerUrl(maplibreWorkerUrl);

app.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">PEIXIU · LOCAL ROUTING</p>
        <h1>广州摩托导航</h1>
        <p class="subtitle">在浏览器本地计算路线，辅助查看已知摄像头点位。</p>
      </div>
    </header>

    <main class="workspace">
      <section class="map-panel" aria-label="广州地图">
        <div id="map" class="map"></div>
        <svg id="scope-overlay" class="scope-overlay" aria-hidden="true"></svg>
        <div class="scope-legend">
          <span class="scope-legend-swatch scope-legend-boundary"></span><span>广州行政边界</span>
          <span class="scope-legend-swatch scope-legend-coverage"></span><span>路网覆盖范围（近似）</span>
          <span class="camera-legend-swatch">摄</span><span>已知摄像头</span>
          <span class="camera-legend-swatch camera-test-legend-swatch">测</span><span>测试点</span>
          <span class="route-fallback-legend-swatch"></span><span>无绕行路线</span>
        </div>
          <div class="map-hint">点击地图设置目的地；尚未定位时，第一次点击设置起点。蓝色虚线为广州行政边界，绿色半透明区域为路网覆盖范围（近似）。</div>
      </section>

      <aside class="control-panel">
        <div class="panel-heading">
          <p class="eyebrow">ROUTE PLANNER</p>
          <h2>规划一条路线</h2>
        </div>

        <div class="point-list">
          <div class="point-row">
            <span class="point-dot point-start">起</span>
            <div class="point-main">
              <span class="point-label">起点</span>
              <strong id="start-label">等待定位或地图选点</strong>
            </div>
            <div class="point-actions">
              <button id="select-start" class="point-action" type="button">重新选择</button>
              <button id="delete-start" class="point-action point-action-delete" type="button">删除</button>
            </div>
          </div>
          <div class="point-row">
            <span class="point-dot point-end">终</span>
            <div class="point-main">
              <span class="point-label">目的地</span>
              <strong id="end-label">点击地图选择</strong>
            </div>
            <div class="point-actions">
              <button id="select-end" class="point-action" type="button">重新选择</button>
              <button id="delete-end" class="point-action point-action-delete" type="button">删除</button>
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
          <summary>地图添加测试摄像头</summary>
          <div class="camera-form">
            <button id="camera-pick-toggle" class="button button-secondary" type="button">开始地图选点</button>
            <ol id="test-camera-list" class="test-camera-list"></ol>
            <button id="clear-test-cameras" class="button button-quiet" type="button">清除全部测试点</button>
          </div>
          <p class="field-hint">开启后点击地图即可连续添加测试点；测试点仅保存在本浏览器，不会修改正式数据。</p>
        </details>

        <p class="disclaimer">摄像头点位资料由爱好者整理维护，仅供辅助参考，可能存在遗漏、延迟或误差。路线结果不构成道路通行资格或合法性判断，请以现场交通标志、道路标线和现行交通法规为准。</p>
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
const cameraPickToggle = document.querySelector<HTMLButtonElement>("#camera-pick-toggle")!;
const testCameraList = document.querySelector<HTMLOListElement>("#test-camera-list")!;
const clearTestCamerasButton = document.querySelector<HTMLButtonElement>("#clear-test-cameras")!;
const startLabel = document.querySelector<HTMLElement>("#start-label")!;
const endLabel = document.querySelector<HTMLElement>("#end-label")!;
const selectStartButton = document.querySelector<HTMLButtonElement>("#select-start")!;
const deleteStartButton = document.querySelector<HTMLButtonElement>("#delete-start")!;
const selectEndButton = document.querySelector<HTMLButtonElement>("#select-end")!;
const deleteEndButton = document.querySelector<HTMLButtonElement>("#delete-end")!;
const distanceElement = document.querySelector<HTMLElement>("#distance")!;
const durationElement = document.querySelector<HTMLElement>("#duration")!;
const avoidedElement = document.querySelector<HTMLElement>("#avoided")!;
const locateButton = document.querySelector<HTMLButtonElement>("#locate")!;
const routeButton = document.querySelector<HTMLButtonElement>("#route")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear")!;
const avoidCamerasInput = document.querySelector<HTMLInputElement>("#avoid-cameras")!;

if (!mapElement || !statusElement || !scopeStatusElement || !graphStatusElement || !scopeOverlayElement || !cameraStatusElement || !cameraPickToggle || !testCameraList || !clearTestCamerasButton || !startLabel || !endLabel || !selectStartButton || !deleteStartButton || !selectEndButton || !deleteEndButton || !distanceElement || !durationElement || !avoidedElement || !locateButton || !routeButton || !clearButton || !avoidCamerasInput) {
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
let routingScopeReady = false;
let administrativeBoundary: GeoJsonGeometry | null = null;
let routingCoverage: GeoJsonGeometry | null = null;
let primaryRouteCoordinates: Array<[number, number]> = [];
let finalRouteCoordinates: Array<[number, number]> = [];
let finalRouteClassName = "route-final";
let cameraData: CameraDataset | null = null;
function getLocalStorage() {
  try {
    return window.localStorage;
  } catch (_error) {
    return undefined;
  }
}

const localStorage = getLocalStorage();
let testCameras: CameraPoint[] = loadLocalTestCameras(localStorage);
let manualCameraSequence = testCameras.reduce((max, camera) => {
  const sequence = Number(camera.id.replace("manual-camera-", ""));
  return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
}, 0);
let cameraPickMode = false;
let start: Coordinate | null = null;
let end: Coordinate | null = null;
let pointSelectionMode: "start" | "end" | null = null;
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

function setPointSelectionMode(mode: "start" | "end") {
  pointSelectionMode = mode;
  setStatus(`请点击地图重新选择${mode === "start" ? "起点" : "目的地"}。`);
}

function clearStart() {
  start = null;
  startMarker?.remove();
  startMarker = null;
  startLabel.textContent = "等待定位或地图选点";
  pointSelectionMode = null;
  clearRoute();
  setStatus("已删除起点，请点击地图重新选择起点。");
}

function clearEnd() {
  end = null;
  endMarker?.remove();
  endMarker = null;
  endLabel.textContent = "点击地图选择";
  pointSelectionMode = null;
  clearRoute();
  setStatus(start ? "已删除目的地，请点击地图重新选择。" : "已删除目的地，请先选择起点。");
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
  setStart(coordinate);
}

function setRouteData(result: CameraAwareRouteResult | null) {
  primaryRouteCoordinates = [];
  finalRouteCoordinates = [];
  finalRouteClassName = "route-final";
  if (result) {
    const primaryRoute = result.primaryRoute ?? result;
    primaryRouteCoordinates = primaryRoute.geometry.coordinates;
    finalRouteCoordinates = result.geometry.coordinates;
    if (result.cameraAvoidanceStatus === "failed") finalRouteClassName = "route-fallback";
  }
  renderRoutingOverlay();
}

function allCameras() {
  return [
    ...(cameraData?.cameras ?? []).map((camera) => ({ camera, test: false })),
    ...testCameras.map((camera) => ({ camera, test: true })),
  ];
}

function appendGeometry(geometry: GeoJsonGeometry, className: string) {
  for (const polygonRings of geometryPolygons(geometry)) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add(className);
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("d", polygonRings.map((ring) => {
      const points = ring.map(([lon, lat]) => {
        const point = map.project([lon, lat]);
        return `${point.x},${point.y}`;
      });
      return `M ${points.join(" L ")} Z`;
    }).join(" "));
    scopeOverlayElement.appendChild(path);
  }
}

function renderRoutingOverlay() {
  const width = mapContainer.clientWidth;
  const height = mapContainer.clientHeight;
  scopeOverlayElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
  scopeOverlayElement.setAttribute("width", String(width));
  scopeOverlayElement.setAttribute("height", String(height));
  scopeOverlayElement.replaceChildren();

  if (administrativeBoundary) appendGeometry(administrativeBoundary, "scope-boundary");
  if (routingCoverage) appendGeometry(routingCoverage, "scope-coverage");

  if (!routingCoverage) for (const bounds of scopeBounds) {
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
    polygon.classList.add("scope-tile-fallback");
    scopeOverlayElement.appendChild(polygon);
  }

  for (const { camera, test } of allCameras()) {
    const point = map.project([camera.lon, camera.lat]);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("camera-point", test ? "camera-point-test" : "camera-point-known");
    if (camera.locationType === "approximate") group.classList.add("camera-point-approximate");
    const approximateLabel = camera.locationType === "approximate" ? `，近似范围${camera.accuracyMeters ?? "未知"}米` : "";
    group.setAttribute("aria-label", `摄像头：${camera.name}${approximateLabel}`);
    if (camera.accuracyMeters) {
      const accuracyPoint = map.project([
        camera.lon + camera.accuracyMeters / (111_320 * Math.cos((camera.lat * Math.PI) / 180)),
        camera.lat,
      ]);
      const accuracyCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      accuracyCircle.classList.add("camera-accuracy");
      accuracyCircle.setAttribute("cx", String(point.x));
      accuracyCircle.setAttribute("cy", String(point.y));
      accuracyCircle.setAttribute("r", String(Math.max(8, Math.abs(accuracyPoint.x - point.x))));
      group.appendChild(accuracyCircle);
    }
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(point.y));
    circle.setAttribute("r", "13");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(point.x));
    label.setAttribute("y", String(point.y));
    label.textContent = camera.restriction?.includes("摩托") ? "禁" : "摄";
    group.append(circle, label);
    scopeOverlayElement.appendChild(group);
  }

  for (const [className, coordinates] of [["route-primary", primaryRouteCoordinates], [finalRouteClassName, finalRouteCoordinates]] as const) {
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

function boundsForTiles(manifest: RoutingManifest) {
  const seenBounds = new Set<string>();
  return manifest.tiles.flatMap(({ bounds }) => {
    const key = [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
    if (seenBounds.has(key)) return [];
    seenBounds.add(key);
    return [bounds];
  });
}

function setRoutingScope(manifest: RoutingManifest) {
  scopeBounds = boundsForTiles(manifest);
  routingScopeReady = true;
  const west = Math.min(...manifest.tiles.map(({ bounds }) => bounds.west));
  const south = Math.min(...manifest.tiles.map(({ bounds }) => bounds.south));
  const east = Math.max(...manifest.tiles.map(({ bounds }) => bounds.east));
  const north = Math.max(...manifest.tiles.map(({ bounds }) => bounds.north));
  scopeStatusElement.textContent = routingCoverage
    ? "广州路网覆盖范围已加载"
    : `${west.toFixed(3)}–${east.toFixed(3)}E / ${south.toFixed(3)}–${north.toFixed(3)}N`;
  const isSynthetic = typeof manifest.source?.osmFixture === "string";
  graphStatusElement.textContent = isSynthetic ? "合成测试路网（仅 Spike）" : "真实 OSM 路网";
  graphStatusElement.classList.toggle("status-warning", isSynthetic);

  renderRoutingOverlay();
}

function isInRoutingScope(coordinate: Coordinate) {
  if (!routingScopeReady) return true;
  if (routingCoverage) return pointInGeometry(coordinate, routingCoverage);
  return scopeBounds.some(({ west, south, east, north }) => coordinate.lon >= west && coordinate.lon <= east && coordinate.lat >= south && coordinate.lat <= north);
}

function resolveScopeUrl(url: string, manifestUrl: string) {
  return new URL(url, new URL(manifestUrl, window.location.href)).href;
}

async function loadScopeGeometry(manifest: RoutingManifest, manifestUrl: string) {
  administrativeBoundary = null;
  routingCoverage = null;

  const requests = [
    ["administrative boundary", manifest.boundaryUrl],
    ["routing coverage", manifest.coverageUrl],
  ] as const;
  const results = await Promise.all(requests.map(async ([kind, url]) => {
    if (!url) return { kind, geometry: null, error: null };
    try {
      return { kind, geometry: await loadGeoJson(resolveScopeUrl(url, manifestUrl)), error: null };
    } catch (error) {
      return { kind, geometry: null, error };
    }
  }));

  for (const result of results) {
    if (result.kind === "administrative boundary") administrativeBoundary = result.geometry;
    if (result.kind === "routing coverage") routingCoverage = result.geometry;
  }

  const geometryErrors = results.filter(({ error }) => error).map(({ kind }) => kind);
  setRoutingScope(manifest);
  if (geometryErrors.length > 0) {
    const fallback = routingCoverage ? "使用已加载路网覆盖范围" : "使用 tile 范围";
    scopeStatusElement.textContent = `范围几何加载失败，${fallback}（${geometryErrors.join("、")}）`;
    scopeStatusElement.classList.add("status-warning");
  }
}

function setCameraData(dataset: CameraDataset) {
  cameraData = dataset;
  renderRoutingOverlay();
  updateCameraStatus();
}

function updateCameraStatus() {
  const knownCount = cameraData?.cameras.length ?? 0;
  const testCount = testCameras.length;
  cameraStatusElement.textContent = testCount > 0
    ? `${knownCount} 个已知点位，${testCount} 个测试点`
    : `${knownCount} 个已知点位`;
}

function renderTestCameraList() {
  testCameraList.replaceChildren();
  if (testCameras.length === 0) {
    const empty = document.createElement("li");
    empty.className = "test-camera-empty";
    empty.textContent = "暂无测试点，请开启地图选点。";
    testCameraList.appendChild(empty);
    return;
  }

  for (const camera of testCameras) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = `${camera.name} · ${formatCoordinate(camera)}`;
    const remove = document.createElement("button");
    remove.className = "test-camera-remove";
    remove.type = "button";
    remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除${camera.name}`);
    remove.addEventListener("click", () => {
      testCameras = testCameras.filter(({ id }) => id !== camera.id);
      saveLocalTestCameras(testCameras, localStorage);
      renderTestCameraList();
      updateCameraStatus();
      clearRoute();
      renderRoutingOverlay();
      setStatus(`已删除${camera.name}。`);
    });
    item.append(text, remove);
    testCameraList.appendChild(item);
  }
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
      clearRoute();
      setStatus(end ? "已更新起点，请重新规划路线。" : "已取得当前位置，请点击地图选择目的地。");
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
  avoidedElement.textContent = result.cameraAvoidanceStatus === "failed"
    ? `${result.nearbyCameraCount ?? 0} 个未避开`
    : `${result.avoidedCameraCount} 个`;

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
  if (cameraPickMode) {
    const camera = {
      id: `manual-camera-${++manualCameraSequence}`,
      name: `测试点位 ${manualCameraSequence}`,
      lat: coordinate.lat,
      lon: coordinate.lon,
      type: "motorcycle-camera",
      description: "当前页面地图选点测试点位",
    };
    testCameras = [...testCameras, camera];
    saveLocalTestCameras(testCameras, localStorage);
    renderTestCameraList();
    updateCameraStatus();
    clearRoute();
    renderRoutingOverlay();
    setStatus(`已添加${camera.name}，可继续点击地图添加。`);
    return;
  }

  if (pointSelectionMode === "start") {
    setStart(coordinate);
    pointSelectionMode = null;
    clearRoute();
    setStatus(end ? "已更新起点，请重新规划路线。" : "已更新起点，请点击地图选择目的地。");
    return;
  }

  if (pointSelectionMode === "end") {
    setEnd(coordinate);
    pointSelectionMode = null;
    clearRoute();
    setStatus("已更新目的地，可以开始规划路线。");
    return;
  }

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
selectStartButton.addEventListener("click", () => setPointSelectionMode("start"));
deleteStartButton.addEventListener("click", clearStart);
selectEndButton.addEventListener("click", () => setPointSelectionMode("end"));
deleteEndButton.addEventListener("click", clearEnd);
clearButton.addEventListener("click", clearEnd);
routeButton.addEventListener("click", () => {
  if (routing) return;
  if (!start || !end) {
    setStatus("请先设置起点和目的地。");
    return;
  }
  if (!isInRoutingScope(start) || !isInRoutingScope(end)) {
    setStatus("起点或目的地在当前路网覆盖范围外，请重新选择地点。");
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
    cameras: cameraData ? [...cameraData.cameras, ...testCameras] : testCameras.length > 0 ? testCameras : undefined,
  });
});

cameraPickToggle.addEventListener("click", () => {
  cameraPickMode = !cameraPickMode;
  cameraPickToggle.textContent = cameraPickMode ? "结束地图选点" : "开始地图选点";
  cameraPickToggle.classList.toggle("button-picking", cameraPickMode);
  map.getCanvas().style.cursor = cameraPickMode ? "crosshair" : "";
  setStatus(cameraPickMode ? "请点击地图添加测试摄像头，可连续添加多个。" : "已结束地图选点。你仍可继续规划路线。");
});

clearTestCamerasButton.addEventListener("click", () => {
  testCameras = [];
  saveLocalTestCameras(testCameras, localStorage);
  renderTestCameraList();
  updateCameraStatus();
  clearRoute();
  renderRoutingOverlay();
  setStatus("已清除全部测试摄像头，保留已知点位。");
});

renderTestCameraList();
updateCameraStatus();

loadCameraDatasetFromManifest(cameraManifestUrl("guangzhou"))
  .then((dataset) => setCameraData(dataset))
  .catch(() => {
    cameraStatusElement.textContent = "加载失败，未进行避让";
  });

const manifestUrl = routingManifestUrl("guangzhou");
loadRoutingManifest(manifestUrl)
  .then((manifest) => loadScopeGeometry(manifest, manifestUrl))
  .catch(() => {
    scopeStatusElement.textContent = "加载失败";
  });

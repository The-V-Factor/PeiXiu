const MAX_ZOOM = 18;
const TILE_PATH = /^\/(\d{1,2})\/(\d+)\/(\d+)\.png$/;
const TILE_ROUTE_PREFIX = "/map-tiles";
const UPSTREAM_BASE_URL = "https://tile.openstreetmap.org";
const DEFAULT_REFERER = "https://peixiu.pages.dev/";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD",
  };
}

function errorResponse(message, status, headers = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders(),
      Allow: "GET, HEAD",
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function parseTilePath(pathname) {
  const match = TILE_PATH.exec(pathname);
  if (!match) return null;

  const z = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const tileCount = 2 ** z;
  if (z > MAX_ZOOM || x >= tileCount || y >= tileCount) return null;

  return { z, x, y };
}

function tileCacheKey(request, tile) {
  const url = new URL(request.url);
  url.search = "";
  url.pathname = `${TILE_ROUTE_PREFIX}/${tile.z}/${tile.x}/${tile.y}.png`;
  return new Request(url.toString(), { method: "GET" });
}

async function fetchTile(env, tile) {
  const upstreamUrl = `${UPSTREAM_BASE_URL}/${tile.z}/${tile.x}/${tile.y}.png`;
  const headers = new Headers({
    Accept: "image/png,image/*;q=0.8",
    Referer: env?.UPSTREAM_REFERER || DEFAULT_REFERER,
    "User-Agent": "PeiXiu map tile proxy (+https://peixiu.pages.dev/)",
  });

  try {
    return await fetch(upstreamUrl, { method: "GET", headers });
  } catch (_error) {
    return null;
  }
}

export async function handleMapTileRequest(request, env) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("Only GET and HEAD are supported", 405);
  }
  if (url.search) return errorResponse("Query parameters are not supported", 400);

  const tile = parseTilePath(url.pathname.slice(TILE_ROUTE_PREFIX.length));
  if (!tile) return errorResponse("Invalid tile coordinates", 404);

  const cacheKey = tileCacheKey(request, tile);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const cachedResponse = cached.clone();
    const headers = new Headers(cachedResponse.headers);
    headers.set("X-PeiXiu-Cache", "HIT");
    return new Response(request.method === "HEAD" ? null : cachedResponse.body, {
      status: cachedResponse.status,
      headers,
    });
  }

  const upstreamResponse = await fetchTile(env, tile);
  if (!upstreamResponse) return errorResponse("Tile upstream unavailable", 504);
  if (!upstreamResponse.ok) {
    return errorResponse(`Tile upstream returned ${upstreamResponse.status}`, 502, {
      "X-PeiXiu-Upstream-Status": String(upstreamResponse.status),
    });
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("X-PeiXiu-Cache", "MISS");
  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "public, max-age=604800, s-maxage=604800");
  }

  const cacheResponse = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
  await caches.default.put(cacheKey, cacheResponse.clone());
  if (request.method === "HEAD") {
    return new Response(null, {
      status: cacheResponse.status,
      headers: cacheResponse.headers,
    });
  }
  return cacheResponse;
}

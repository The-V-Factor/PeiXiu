const defaultMapTileProxyUrl = "/map-tiles/{z}/{x}/{y}.png";
const directMapTileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function mapTileUrlTemplate() {
  return import.meta.env.VITE_MAP_TILE_PROXY_URL?.trim() || defaultMapTileProxyUrl;
}

export { defaultMapTileProxyUrl, directMapTileUrl };

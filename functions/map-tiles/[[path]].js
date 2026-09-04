import { handleMapTileRequest } from "../_shared/map-tile-proxy.js";

export function onRequest(context) {
  return handleMapTileRequest(context.request, context.env);
}

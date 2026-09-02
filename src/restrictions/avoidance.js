import { selectCamerasNearRoute } from "./geometry.js";

const CAMERA_DATA_UNAVAILABLE = "摄像头数据未加载，本次路线未进行摄像头避让。";
const cameraRouteFailedMessage = (count, maxDetourMeters) =>
  `未找到最多增加 ${maxDetourMeters / 1000} 公里的绕行路线，当前首选路线可能经过 ${count} 个已知摄像头。`;

export async function routeWithCameraAvoidance(input, options) {
  const primaryInput = { ...input };
  delete primaryInput.excludeLocations;
  const primaryRoute = await options.route(primaryInput);
  const corridorMeters = options.corridorMeters ?? 20;
  const maxDetourMeters = options.maxDetourMeters ?? 3000;

  let dataset;
  try {
    dataset = await options.loadCameras();
  } catch (_error) {
    return {
      ...primaryRoute,
      primaryRoute,
      avoidedCameraCount: 0,
      nearbyCameraCount: 0,
      cameraAvoidanceStatus: "unavailable",
      cameraAvoidanceMessage: CAMERA_DATA_UNAVAILABLE,
    };
  }

  const nearbyCameras = selectCamerasNearRoute(primaryRoute, dataset.cameras, corridorMeters);
  if (nearbyCameras.length === 0) {
    return {
      ...primaryRoute,
      primaryRoute,
      avoidedCameraCount: 0,
      nearbyCameraCount: 0,
      cameraAvoidanceStatus: "not-needed",
    };
  }

  try {
    const avoidedRoute = await options.route({
        ...primaryInput,
        excludeLocations: nearbyCameras.map(({ lat, lon }) => ({ lat, lon })),
      });
    if (avoidedRoute.distanceMeters > primaryRoute.distanceMeters + maxDetourMeters) {
      throw new Error("Avoided route exceeds the maximum detour distance");
    }
    return {
      ...avoidedRoute,
      primaryRoute,
      avoidedCameraCount: nearbyCameras.length,
      nearbyCameraCount: nearbyCameras.length,
      cameraAvoidanceStatus: "applied",
    };
  } catch (_error) {
    return {
      ...primaryRoute,
      primaryRoute,
      avoidedCameraCount: 0,
      nearbyCameraCount: nearbyCameras.length,
      cameraAvoidanceStatus: "failed",
      cameraAvoidanceMessage: cameraRouteFailedMessage(nearbyCameras.length, maxDetourMeters),
    };
  }
}

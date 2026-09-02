import { selectCamerasNearRoute } from "./geometry.js";

const CAMERA_DATA_UNAVAILABLE = "摄像头数据未加载，本次路线未进行摄像头避让。";
const DEFAULT_MAX_AVOIDANCE_ATTEMPTS = 5;
const cameraRouteFailedMessage = (count, maxDetourMeters) =>
  `未找到最多增加 ${maxDetourMeters / 1000} 公里的绕行路线，当前首选路线可能经过 ${count} 个已知摄像头。`;

export async function routeWithCameraAvoidance(input, options) {
  const primaryInput = { ...input };
  delete primaryInput.excludeLocations;
  const primaryRoute = await options.route(primaryInput);
  const corridorMeters = options.corridorMeters ?? 20;
  const maxDetourMeters = options.maxDetourMeters ?? 8000;
  const maxAvoidanceAttempts = options.maxAvoidanceAttempts ?? DEFAULT_MAX_AVOIDANCE_ATTEMPTS;

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

  const excludeLocations = nearbyCameras.map(({ lat, lon }) => ({ lat, lon }));
  for (let attempt = 0; attempt < maxAvoidanceAttempts; attempt += 1) {
    try {
      const avoidedRoute = await options.route({ ...primaryInput, excludeLocations });
      if (avoidedRoute.distanceMeters > primaryRoute.distanceMeters + maxDetourMeters) continue;

      const remainingCameras = selectCamerasNearRoute(avoidedRoute, nearbyCameras, corridorMeters);
      if (remainingCameras.length === 0) {
        return {
          ...avoidedRoute,
          primaryRoute,
          avoidedCameraCount: nearbyCameras.length,
          nearbyCameraCount: nearbyCameras.length,
          cameraAvoidanceStatus: "applied",
        };
      }
    } catch (_error) {
      break;
    }
  }

  return {
    ...primaryRoute,
    primaryRoute,
    avoidedCameraCount: 0,
    nearbyCameraCount: nearbyCameras.length,
    cameraAvoidanceStatus: "failed",
    cameraAvoidanceMessage: cameraRouteFailedMessage(nearbyCameras.length, maxDetourMeters),
  };
}

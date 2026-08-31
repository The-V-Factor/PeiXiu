import { selectCamerasNearRoute } from "./geometry.js";

const CAMERA_DATA_UNAVAILABLE = "摄像头数据未加载，本次路线未进行摄像头避让。";
const CAMERA_ROUTE_FAILED = "摄像头避让路线计算失败，已返回首选路线。";

export async function routeWithCameraAvoidance(input, options) {
  const primaryInput = { ...input };
  delete primaryInput.excludeLocations;
  const primaryRoute = await options.route(primaryInput);

  let dataset;
  try {
    dataset = await options.loadCameras();
  } catch (_error) {
    return {
      ...primaryRoute,
      primaryRoute,
      avoidedCameraCount: 0,
      cameraAvoidanceStatus: "unavailable",
      cameraAvoidanceMessage: CAMERA_DATA_UNAVAILABLE,
    };
  }

  const nearbyCameras = selectCamerasNearRoute(primaryRoute, dataset.cameras, options.corridorMeters ?? 200);
  if (nearbyCameras.length === 0) {
    return {
      ...primaryRoute,
      primaryRoute,
      avoidedCameraCount: 0,
      cameraAvoidanceStatus: "not-needed",
    };
  }

  try {
    const avoidedRoute = await options.route({
      ...primaryInput,
      excludeLocations: nearbyCameras.map(({ lat, lon }) => ({ lat, lon })),
    });
    return {
      ...avoidedRoute,
      primaryRoute,
      avoidedCameraCount: nearbyCameras.length,
      cameraAvoidanceStatus: "applied",
    };
  } catch (_error) {
    return {
      ...primaryRoute,
      primaryRoute,
      avoidedCameraCount: 0,
      cameraAvoidanceStatus: "failed",
      cameraAvoidanceMessage: CAMERA_ROUTE_FAILED,
    };
  }
}

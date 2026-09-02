const storageKey = "peixiu.test-cameras.v1";

export function loadLocalTestCameras(storage) {
  if (!storage) return [];

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const cameras = JSON.parse(raw);
    if (!Array.isArray(cameras)) return [];
    return cameras.filter((camera) =>
      camera &&
      typeof camera.id === "string" &&
      camera.id.startsWith("manual-camera-") &&
      typeof camera.name === "string" &&
      Number.isFinite(camera.lat) &&
      Number.isFinite(camera.lon) &&
      camera.lat >= -90 &&
      camera.lat <= 90 &&
      camera.lon >= -180 &&
      camera.lon <= 180,
    );
  } catch (_error) {
    return [];
  }
}

export function saveLocalTestCameras(cameras, storage) {
  if (!storage) return;

  try {
    storage.setItem(storageKey, JSON.stringify(cameras));
  } catch (_error) {
    // Storage can be unavailable in private browsing; the current session still works.
  }
}

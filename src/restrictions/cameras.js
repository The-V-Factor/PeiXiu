const isCoordinate = (value) =>
  value &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lon) &&
  value.lat >= -90 &&
  value.lat <= 90 &&
  value.lon >= -180 &&
  value.lon <= 180;

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

export function parseCameraDataset(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Camera dataset must be an object");
  }

  if (value.version !== 1 || !isNonEmptyString(value.region) || !isNonEmptyString(value.updatedAt) || !isNonEmptyString(value.source)) {
    throw new TypeError("Camera dataset metadata is invalid");
  }

  if (!Array.isArray(value.cameras)) {
    throw new TypeError("Camera dataset cameras must be an array");
  }

  const cameras = value.cameras.map((camera) => {
    if (
      !camera ||
      !isNonEmptyString(camera.id) ||
      !isNonEmptyString(camera.name) ||
      !isNonEmptyString(camera.type) ||
      !isCoordinate(camera)
    ) {
      throw new TypeError("Camera dataset contains an invalid camera");
    }

    return {
      id: camera.id,
      name: camera.name,
      lat: camera.lat,
      lon: camera.lon,
      type: camera.type,
      ...(camera.description === undefined ? {} : { description: String(camera.description) }),
    };
  });

  return {
    version: 1,
    region: value.region,
    updatedAt: value.updatedAt,
    source: value.source,
    cameras,
  };
}

export async function loadCameraDataset(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Camera dataset request failed: HTTP ${response.status}`);
  }
  return parseCameraDataset(await response.json());
}

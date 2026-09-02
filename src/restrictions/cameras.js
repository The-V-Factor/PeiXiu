const isCoordinate = (value) =>
  value &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lon) &&
  value.lat >= -90 &&
  value.lat <= 90 &&
  value.lon >= -180 &&
  value.lon <= 180;

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function isDataUrl(value) {
  if (!isNonEmptyString(value)) return false;
  if (!value.includes("://")) return !value.split("/").includes("..");
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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
      ...(camera.restriction === undefined ? {} : { restriction: String(camera.restriction) }),
      ...(camera.direction === undefined ? {} : { direction: String(camera.direction) }),
      ...(camera.vehicleScope === undefined ? {} : { vehicleScope: String(camera.vehicleScope) }),
      ...(camera.locationType === undefined ? {} : { locationType: String(camera.locationType) }),
      ...(camera.accuracyMeters === undefined ? {} : { accuracyMeters: Number(camera.accuracyMeters) }),
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

export function parseCameraManifest(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.version !== 1 ||
    !isNonEmptyString(value.region) ||
    !isNonEmptyString(value.datasetVersion) ||
    !isNonEmptyString(value.updatedAt) ||
    !isDataUrl(value.dataUrl)
  ) {
    throw new TypeError("Camera manifest metadata is invalid");
  }

  return {
    version: 1,
    region: value.region,
    datasetVersion: value.datasetVersion,
    updatedAt: value.updatedAt,
    dataUrl: value.dataUrl,
  };
}

export async function loadCameraDatasetFromManifest(manifestUrl, fetchImpl = fetch) {
  const manifestResponse = await fetchImpl(manifestUrl, { cache: "no-store" });
  if (!manifestResponse.ok) {
    throw new Error(`Camera manifest request failed: HTTP ${manifestResponse.status}`);
  }

  const manifest = parseCameraManifest(await manifestResponse.json());
  const baseUrl = typeof window !== "undefined"
    ? window.location.href
    : typeof self !== "undefined"
      ? self.location.href
      : "http://localhost/";
  const datasetUrl = new URL(manifest.dataUrl, new URL(manifestUrl, baseUrl)).href;
  const dataset = await loadCameraDataset(datasetUrl, fetchImpl);
  if (dataset.region !== manifest.region) {
    throw new Error(`Camera dataset region mismatch: ${dataset.region}`);
  }
  return dataset;
}

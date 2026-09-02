const defaultCameraManifestUrl =
  "https://cdn.jsdelivr.net/gh/The-V-Factor/PeiXiu-routing-data@main/cameras/guangzhou/manifest.json";

export function cameraManifestUrl(region: string) {
  if (region === "guangzhou") {
    return import.meta.env.VITE_CAMERA_MANIFEST_URL || defaultCameraManifestUrl;
  }

  return `/cameras/${region}/manifest.json`;
}

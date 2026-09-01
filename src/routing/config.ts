const defaultManifestUrl =
  "https://cdn.jsdelivr.net/gh/The-V-Factor/PeiXiu-routing-data@main/routing/guangzhou/manifest.json";

export function routingManifestUrl(region: string) {
  if (region === "guangzhou") {
    return import.meta.env.VITE_ROUTING_MANIFEST_URL || defaultManifestUrl;
  }

  return `/routing/${region}/manifest.json`;
}

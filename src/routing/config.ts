const localManifestUrl = "/routing/guangzhou/manifest.json";

export function routingManifestUrl(region: string) {
  if (region === "guangzhou") {
    return import.meta.env.VITE_ROUTING_MANIFEST_URL || localManifestUrl;
  }

  return `/routing/${region}/manifest.json`;
}

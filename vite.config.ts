import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  if (command === "build") {
    const configuredMapTileProxyUrl = process.env.VITE_MAP_TILE_PROXY_URL?.trim();
    console.log(
      `[PeiXiu build] VITE_MAP_TILE_PROXY_URL=${configuredMapTileProxyUrl || "(not set; using built-in Worker URL)"}`,
    );
  }

  return {
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          spike: fileURLToPath(new URL("./spike/valhalla-route.html", import.meta.url)),
        },
      },
    },
  };
});

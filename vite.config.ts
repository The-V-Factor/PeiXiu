import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        spike: fileURLToPath(new URL("./spike/valhalla-route.html", import.meta.url)),
      },
    },
  },
});

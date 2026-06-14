import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL("./index.html", import.meta.url)),
        othello: fileURLToPath(new URL("./othello.html", import.meta.url)),
        go: fileURLToPath(new URL("./go.html", import.meta.url))
      },
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) {
            return "three-vendor";
          }

          return undefined;
        }
      }
    }
  }
});

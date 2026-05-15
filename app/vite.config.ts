import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "src/main/index.ts",
        vite: {
          build: {
            rollupOptions: {
              external: ["keytar", "ws"],
            },
          },
        },
      },
      preload: {
        input: {
          "preload/index": "src/preload/index.ts",
        },
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        floating: "src/renderer/floating/index.html",
        settings: "src/renderer/settings/index.html",
      },
    },
  },
});

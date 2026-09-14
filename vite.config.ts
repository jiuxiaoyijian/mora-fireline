import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("node_modules/three") ? "three" : undefined,
      },
    },
  },
});

import { appKitTypesPlugin } from "@databricks/appkit";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const clientRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: clientRoot,
  plugins: [
    tailwindcss(),
    react(),
    appKitTypesPlugin({
      outFile: "src/appKitTypes.d.ts",
      watchFolders: [path.resolve(clientRoot, "../config/queries")],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

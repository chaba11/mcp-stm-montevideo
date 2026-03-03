import { defineConfig } from "tsup";
import { existsSync, mkdirSync, copyFileSync } from "fs";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node20",
    clean: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
    onSuccess: async () => {
      const src = "src/data/mvd-geocoder-data.json";
      const dest = "dist/data/mvd-geocoder-data.json";
      if (existsSync(src)) {
        mkdirSync("dist/data", { recursive: true });
        copyFileSync(src, dest);
        console.log(`Copied ${src} → ${dest}`);
      }
    },
  },
  {
    entry: ["src/api/index.ts"],
    format: ["esm"],
    target: "node20",
    outDir: "dist/api",
  },
]);

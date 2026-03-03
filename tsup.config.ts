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
      mkdirSync("dist/data", { recursive: true });
      const dataToCopy = [
        "mvd-geocoder-data.json",
        "stm-paradas.json",
        "stm-horarios.json",
        "stm-lineas.json",
      ];
      for (const file of dataToCopy) {
        const src = `src/data/${file}`;
        const dest = `dist/data/${file}`;
        if (existsSync(src)) {
          copyFileSync(src, dest);
          console.log(`Copied ${src} → ${dest}`);
        }
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

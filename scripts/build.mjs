import { resolve } from "node:path";
import { build } from "vite";

const root = process.cwd();

const popupOutput = {
  assetFileNames: "assets/[name].[ext]",
  chunkFileNames: "assets/[name].js",
  entryFileNames: "assets/[name].js",
};

await build({
  configFile: false,
  root,
  publicDir: resolve(root, "public"),
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(root, "popup.html"),
      },
      output: popupOutput,
    },
  },
});

await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: "dist/assets",
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(root, "src/content/main.ts"),
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "content.js",
        name: "ProbablyAIContent",
      },
    },
  },
});

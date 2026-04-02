import { resolve } from "node:path";
import { build } from "vite";

const root = process.cwd();

const popupOutput = {
  assetFileNames: "assets/[name].[ext]",
  chunkFileNames: "assets/[name].js",
  entryFileNames: "assets/[name].js",
};

/** Minifies CSS inside template literals (e.g. style.textContent = `...`) */
function minifyInlineCss() {
  return {
    name: "minify-inline-css",
    transform(code, id) {
      if (!id.endsWith("detector.ts")) return;
      return code.replace(
        /\.textContent\s*=\s*`([^`]+)`/g,
        (_match, css) => {
          const minified = css
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\s+/g, " ")
            .replace(/\s*([{}:;,>~+])\s*/g, "$1")
            .replace(/;}/g, "}")
            .trim();
          return `.textContent=\`${minified}\``;
        },
      );
    },
  };
}

// Build 1: Popup HTML + CSS + JS
await build({
  configFile: false,
  root,
  publicDir: resolve(root, "public"),
  base: "./",
  build: {
    target: "esnext",
    sourcemap: false,
    modulePreload: { polyfill: false },
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

// Build 2: Content script (IIFE)
await build({
  configFile: false,
  root,
  publicDir: false,
  plugins: [minifyInlineCss()],
  build: {
    target: "esnext",
    sourcemap: false,
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

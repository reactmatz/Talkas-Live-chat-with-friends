import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** `foo.wasm?inline` → a data: URL string, so the noise-suppression models load from memory (works from file://). */
function wasmInline(): Plugin {
  return {
    name: "wasm-inline",
    enforce: "pre",
    load(id) {
      if (!id.endsWith(".wasm?inline")) return null;
      const b64 = readFileSync(id.slice(0, -"?inline".length)).toString("base64");
      return `export default "data:application/wasm;base64,${b64}";`;
    },
  };
}

export default defineConfig({
  plugins: [wasmInline(), react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: "./", // loaded from file:// when packaged
  server: { port: 5180, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});

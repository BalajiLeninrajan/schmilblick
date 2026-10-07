import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // lightningcss rejects catppuccin-neu's `::picker(select):popover-open`, so minify CSS with esbuild.
  build: { cssMinify: "esbuild" },
});

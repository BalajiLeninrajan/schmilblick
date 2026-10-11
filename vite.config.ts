import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // lightningcss rejects catppuccin-neu's `::picker(select):popover-open`, so minify CSS with esbuild.
  build: {
    cssMinify: "esbuild",
    // posthog-js alone would push the entry chunk past Vite's 500 kB warning; its own chunk also stays cached across deploys.
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: "posthog", test: /node_modules[\\/]posthog-js/ }] } } },
  },
});

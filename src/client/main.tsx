import "catppuccin-neu/css/index.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import posthog from "posthog-js";
import { App } from "./App";

// Cookieless, so nothing lands in cookies or storage. Player names show up all
// over the lobby and game, so LobbyPage marks its <main> ph-sensitive.
posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2026-05-30",
  cookieless_mode: "always",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

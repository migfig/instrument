import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";
import "./app.css";
import { runStore } from "./state/run";

// e2e hook: the queue (not timers) owns state — the walkthrough inspects it
(window as unknown as Record<string, unknown>).__runStore = runStore;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

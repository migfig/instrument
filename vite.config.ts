import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The instrument backend (serve.server) — overridable for the e2e judge,
// which spins up a tiny CPU model on its own port.
const target = process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8100";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    proxy: {
      "/health": { target, changeOrigin: true },
      "/generate": { target, changeOrigin: true },
      "/explain": { target, changeOrigin: true },
    },
  },
});

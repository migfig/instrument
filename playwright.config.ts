import { defineConfig } from "@playwright/test";

// The FrontEnd's single judge framework (research R10): one Playwright
// config, 1280x800, base URL the Vite dev server. The backend is the tiny
// CPU model (GPU must stay free for the user's llama-server).
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 180_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    viewport: { width: 1280, height: 800 },
    baseURL: "http://localhost:5173",
  },
  webServer: [
    {
      command: "uv run python frontend/e2e/dev_server.py",
      cwd: "..",
      url: "http://127.0.0.1:8100/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});

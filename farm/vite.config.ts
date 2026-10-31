import { defineConfig } from "vitest/config";

import { MinTestsReporter } from "./scripts/min-tests-reporter.ts";

export default defineConfig({
  // Dev-server only: accept the sandbox preview host alongside localhost.
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app", "localhost"],
  },
  // Everything is local: no CDN fonts, scripts or remote assets at runtime.
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: ["default", new MinTestsReporter()],
  },
});

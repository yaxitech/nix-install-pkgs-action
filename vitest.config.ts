import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**"],
      // Write the summary for the coverage badge even if some tests fail
      reportOnFailure: true,
      reporter: ["json", "json-summary", "lcov", "text", "clover"],
    },
  },
});

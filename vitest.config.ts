import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Pin a DST-observing timezone so the SLA epoch-vs-DST and week-shape
    // tests can actually discriminate epoch math from wall-clock math
    // (the dev machine's own zone has no DST). Runtime process.env.TZ
    // assignment is the verified-working mechanism on Windows/Node 24;
    // the suites carry an offset canary in case pinning ever silently fails.
    env: { TZ: "America/New_York" },
  },
});

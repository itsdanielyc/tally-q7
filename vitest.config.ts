import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/{unit,contracts,integration}/**/*.test.ts"],
    environment: "node",
  },
});

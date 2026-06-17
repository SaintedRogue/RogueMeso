import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the tsconfig "@/*" -> "src/*" path alias so tests import the same way app code does.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Tests live in a top-level tests/ tree mirroring src/; they import app code via the
    // "@/" alias above (same as app code), so they stay decoupled from their own location.
    include: ["tests/**/*.test.ts"],
  },
});

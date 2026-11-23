import { defineConfig } from "vitest/config";

// Tests call the Worker's fetch handler directly with standard Request objects.
// Node 18+ provides Request/Response/crypto globals, so no Workers pool is needed.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The client half is React Native (rendered by Paseo's host), so component
 * tests run in jsdom with thin stubs for the three host-only modules:
 * `react-native` primitives, the plugin UI kit, and the plugin client context.
 */
const stub = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: stub("./tests/stubs/react-native.tsx") },
      {
        find: /^@getpaseo\/plugin\/client\/ui$/,
        replacement: stub("./tests/stubs/plugin-ui.tsx"),
      },
      {
        find: /^@getpaseo\/plugin\/client$/,
        replacement: stub("./tests/stubs/plugin-client.tsx"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.tsx"],
  },
});

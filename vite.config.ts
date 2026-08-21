/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { krakenApiDevServer } from "./vite/krakenApiDevServer";

// This config deliberately does **not** read the Kraken credentials, and must
// never grow a `define` that does. Anything substituted here is compiled into
// the client bundle and is readable by every visitor; the credentials live in
// the server-side environment that `api/` reads, and nowhere else. See the
// "Credentials and simulation mode" section of `AGENTS.md`.

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    svgr(),
    // The `api/` handlers, mounted on the dev server so `npm run dev` behaves
    // like the deployment. Skipped under Vitest: this plugin reads `local.env`
    // into `process.env`, and the suite must never pick up a developer's real
    // credentials - CI and a laptop have to agree.
    ...(process.env.VITEST ? [] : [krakenApiDevServer(__dirname)]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@widgets": path.resolve(__dirname, "./src/components/widgets"),
      "@common": path.resolve(__dirname, "./src/components/common"),
      "@hooks": path.resolve(__dirname, "./src/hooks"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@store": path.resolve(__dirname, "./src/store"),
      "@data": path.resolve(__dirname, "./src/data"),
      "@assets": path.resolve(__dirname, "./src/assets"),
      "@api": path.resolve(__dirname, "./src/api"),
      "@styles": path.resolve(__dirname, "./src/styles"),
    },
  },
  // Vitest reuses everything above - the same plugins (so `?react` SVG imports
  // and the React compiler behave identically) and the same `resolve.alias`
  // map, so there is no second copy of the alias table to drift out of sync.
  test: {
    // Most of the suite is pure logic, which runs faster and more honestly in
    // node. Component tests opt into the DOM with a `@vitest-environment
    // jsdom` docblock, so we only pay for jsdom where it is actually used.
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    // `api/` and `vite/` are server-side and dev-server code. They run in the
    // same suite as the client so the signing tests run on every push.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "api/**/*.{test,spec}.ts",
      "vite/**/*.{test,spec}.ts",
    ],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}", "api/**/*.ts", "vite/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "api/**/*.test.ts",
        "vite/**/*.test.ts",
        "src/test/**",
        "src/**/index.ts", // re-export barrels
        "src/**/*.styles.ts",
        "src/types/**",
        "src/main.tsx",
      ],
    },
  },
});

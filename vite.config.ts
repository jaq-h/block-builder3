/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      tailwindcss(),
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler"]],
        },
      }),
      svgr(),
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
    define: {
      "import.meta.env.KRAKEN_API_KEY": JSON.stringify(env.KRAKEN_API_KEY),
      "import.meta.env.KRAKEN_API_PRIVATE_KEY": JSON.stringify(
        env.KRAKEN_API_PRIVATE_KEY,
      ),
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
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      restoreMocks: true,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/test/**",
          "src/**/index.ts", // re-export barrels
          "src/**/*.styles.ts",
          "src/types/**",
          "src/main.tsx",
        ],
      },
    },
  };
});

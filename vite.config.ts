import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), svgr()],
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
  };
});

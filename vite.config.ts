import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.KRAKEN_API_KEY": JSON.stringify(env.KRAKEN_API_KEY),
      "import.meta.env.KRAKEN_API_PRIVATE_KEY": JSON.stringify(
        env.KRAKEN_API_PRIVATE_KEY,
      ),
    },
  };
});

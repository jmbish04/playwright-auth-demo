import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
  resolve: {
    alias: {
      'playwright': '@cloudflare/playwright',
    },
  },
});

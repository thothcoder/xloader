import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";

export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: "xloader",
    description: "Browse and download media from any public X account",
    permissions: ["cookies", "storage", "activeTab", "offscreen"],
    host_permissions: [
      "https://x.com/*",
      "https://api.x.com/*",
      "https://abs.twimg.com/*",
      "https://pbs.twimg.com/*",
      "https://video.twimg.com/*",
    ],
  },
});

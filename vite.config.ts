import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig(() => {
  // The BFF port is configurable (PORT) since :3000 is commonly taken.
  const apiTarget = `http://localhost:${process.env.PORT || 3000}`;
  const publicSimulator = process.env.VITE_PUBLIC_SIMULATOR === "true";

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(publicSimulator ? [{
        name: "public-simulator-html",
        transformIndexHtml: (html: string) => html.replace(/^\s*<link rel="(?:manifest|icon|apple-touch-icon)".*\n/gmu, ""),
      }] : []),
    ],
    root: "client",
    // A scoped PR preview must not install the production PWA or claim an app
    // start URL. It receives only the compiled SPA and its hashed assets.
    publicDir: publicSimulator ? false : "public",
    build: {
      // server/index.ts resolves dist/server/index.js -> ../client
      outDir: "../dist/client",
      emptyOutDir: true,
    },
    server: {
      // 0.0.0.0 so the dev UI is reachable over the tailnet from a phone —
      // mobile access is a first-class surface (docs/mobile.md).
      host: "0.0.0.0",
      port: 5173,
      // Vite rejects dev-server requests whose Host header is not allowlisted
      // (DNS-rebinding protection). Tailscale hosts are not localhost, so set
      // VITE_ALLOWED_HOSTS ("all", or a comma-separated allowlist) when
      // serving to a phone. Unset keeps Vite's localhost-only default.
      allowedHosts:
        process.env.VITE_ALLOWED_HOSTS === "all"
          ? (true as const)
          : process.env.VITE_ALLOWED_HOSTS?.split(",")
              .map((host) => host.trim())
              .filter(Boolean),
      fs: {
        // Explicit allowlist — never the repo root, which would expose .env
        // through /@fs/. server/opencode/ holds isomorphic client+server code.
        allow: [
          resolve(process.cwd(), "client"),
          resolve(process.cwd(), "server"),
          resolve(process.cwd(), "docs"),
          resolve(process.cwd(), "deploy/README.md"),
          resolve(process.cwd(), "reminders/README.md"),
          resolve(process.cwd(), "README.md"),
          resolve(process.cwd(), "CONTRIBUTING.md"),
          resolve(process.cwd(), "AGENTS.md"),
        ],
      },
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});

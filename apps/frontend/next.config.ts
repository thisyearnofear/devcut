import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Load the repo-root .env so vars defined there (BFF_URL, etc.) are visible
// to next.config.ts and to the dev/prod runtime. Next reads `apps/frontend/.env`
// after this — local overrides still win when present.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(here, "../.."));

const BFF_URL = process.env.BFF_URL ?? "http://localhost:4010";

const nextConfig: NextConfig = {
  // Produce a self-contained output directory for Docker.
  // The standalone build includes only the files needed to run the server —
  // no node_modules copy required in the container image.
  output: "standalone",
  transpilePackages: [
    "@copilotkit/react-core",
    "@copilotkit/react-ui",
    "streamdown",
    "mermaid",
  ],

  // Proxy CopilotKit runtime requests to the Hono BFF (apps/bff). We can't run
  // the runtime in a Next.js API route directly because the runtime's v2 entry
  // pulls in express, which Next can't bundle (dynamic require in view.js).
  // Same-origin proxy keeps the drawer's relative fetches (e.g.
  // PATCH /api/copilotkit/threads/{id}) working without CORS.
  async rewrites() {
    return [
      {
        source: "/api/copilotkit/:path*",
        destination: `${BFF_URL}/api/copilotkit/:path*`,
      },
      {
        source: "/api/copilotkit",
        destination: `${BFF_URL}/api/copilotkit`,
      },
      {
        source: "/api/thread-state/:path*",
        destination: `${BFF_URL}/api/thread-state/:path*`,
      },
      {
        source: "/api/x402/:path*",
        destination: `${BFF_URL}/api/x402/:path*`,
      },
      {
        source: "/api/x402",
        destination: `${BFF_URL}/api/x402/catalog`,
      },
    ];
  },
};

export default nextConfig;

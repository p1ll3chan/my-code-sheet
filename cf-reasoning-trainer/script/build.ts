import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";

// Reuses the original two-stage Vite + esbuild build; no database or secret needed.
await viteBuild();
await esbuild({ entryPoints: ["server/index.ts"], platform: "node", target: "node24", bundle: true,
  format: "esm", packages: "external", outfile: "dist/index.js", logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
});

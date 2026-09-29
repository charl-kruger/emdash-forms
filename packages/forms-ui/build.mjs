import { build } from "esbuild";

// Bundle the internal engine into the single installable native plugin.
await build({
  entryPoints: { index: "src/index.ts", schema: "../forms-engine/src/schema.ts", templates: "../forms-engine/src/templates.ts" },
  outdir: "dist", bundle: true, format: "esm", platform: "neutral", target: "es2022",
  external: ["emdash", "emdash/*", "zod", "zod/*"],
});

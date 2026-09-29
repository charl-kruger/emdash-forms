import { build } from "esbuild";

// The engine's shared schema is bundled in; host packages stay external.
// "#zod" is the engine's internal alias for zod/mini, which consumers install via our zod dependency.
await build({
  entryPoints: { index: "src/index.ts", PublicForm: "src/PublicForm.tsx" },
  outdir: "dist", bundle: true, format: "esm", platform: "neutral", target: "es2022", jsx: "automatic",
  alias: { "#zod": "zod/mini" },
  external: ["emdash", "emdash/*", "zod", "zod/*", "react", "react/*", "react-dom", "react-dom/*"],
});

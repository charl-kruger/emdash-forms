# EmDash Forms

An EmDash forms plugin workspace with a sandboxed forms engine and an optional native Forms Studio companion.

The engine provides form definitions, validation, conditional logic, submissions, entry management, export, notifications, and agent-facing operations. The companion adds a visual editor, json-render admin views, and public Astro form rendering. The companion is trusted site code and requires a site build and deployment; it is not installed by the sandbox plugin registry.

## Project status

This is an early development release targeting EmDash 0.42.x. It is not a complete WPForms replacement and does not yet implement every WPForms premium feature. See the package READMEs for current capabilities and limitations. No WPForms PHP source or downloaded plugin archive is included.

The packages are not published to npm or the EmDash registry. The engine manifest intentionally has a reserved development publisher identity, and its publish script fails until real publisher and security-contact metadata are configured. Do not attempt to publish this checkout as-is.

## Workspace

- `packages/forms-engine`: sandboxed registry-format plugin and tests
- `packages/forms-ui`: native React/Astro companion and guided site installer
- `docs/`: installation-boundary and registry distribution decisions

Requirements: Node.js and pnpm 11. Install workspace dependencies with `pnpm install`.

Useful commands:

```sh
pnpm forms:check
pnpm forms:test
pnpm forms:build
pnpm --filter @emdash-forms/engine bundle
```

The development packages use the official EmDash plugin CLI. Configure the sandbox runner and install the sandbox engine before registering Forms Studio. The companion installer requires a compatible server-rendered Astro site and fails on unsupported configuration shapes.

## Distribution model

The sandboxed engine is the part suited to EmDash's plugin registry. The native companion provides the React admin experience and public Astro component; sites must add the companion package, build, and deploy. A registry install alone does not install trusted browser or Astro code.

A real release requires a verified publisher identity, package publication, registry installation testing, and explicit engine/companion version compatibility. See [the registry analysis](docs/forms-registry-analysis.md).

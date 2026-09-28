# Forms engine for EmDash

Development release 0.1.0, tested with EmDash 0.42.0. This is an original TypeScript implementation, not the PHP WPForms plugin. It does not yet provide complete WPForms premium parity.

## Registry and native installation

The engine is a sandboxed registry-format bundle. It includes Block Kit management, typed API routes, MCP tools, form definitions and entry storage. Registry users can create templates, edit JSON definitions, publish/pause and inspect responses.

The optional `@emdash-forms/ui` native companion adds the React visual builder, json-render administration and Astro form rendering. It requires a site build/deployment and is not installable through the sandbox registry.

The local workspace registers the CLI-generated engine descriptor and companion in `astro.config.mjs`. The engine runs through the Cloudflare sandbox runner. This is a local configuration installation, not proof of a public registry release.

## Implemented

17 field/layout types, templates, conditions, multipage and conversational layouts, calculations, ratings/NPS, signature capture, draft/published snapshots, opening/closing dates, revision protection, email notifications, entries, private notes, stars, CSV export and agent operations.

Notifications require an EmDash transport; entry delivery state reports pending, sent or failed. No provider credentials are bundled. Basic submission protection includes expiring single-use tickets, minimum completion time, honeypot validation and duplicate detection. Public production deployment still needs rate limiting and stronger bot controls. Expired tickets are removed in bounded scheduled batches.

## Development

From the workspace root:

```sh
pnpm forms:check
pnpm forms:test
pnpm forms:build
pnpm build
pnpm --filter @emdash-forms/engine bundle
```

Tests use the production Worker Loader sandbox and host bridge, including route permissions, CSRF and declarative admin validation.

## Release

The current manifest uses the reserved development identity `did:web:development.invalid`; it must not be publicly published. Configure a real Atmosphere publisher, author and security contact before enabling the publish script. The official CLI is pinned to 0.13.1. A real release requires bundle validation, a version bump, registry-install verification and a separately published companion package.

Data lives in the engine installation's namespace. A registry ID differs from the local `forms-engine` ID. Bind the companion to the actual approved installed ID; switching IDs does not migrate forms or entries.

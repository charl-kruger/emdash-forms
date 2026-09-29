# Forms engine for EmDash

> **Current decision — 29 September 2026:** Forms is now one trusted native plugin, `@emdash-forms/plugin`, registered once as `forms()`. It bundles the private engine, React builder and Astro renderer. The split-plugin/registry architecture below is historical, not installation guidance. See the root README and `docs/combined-plugin.md` for the current design and verification.

Development release 0.1.0, tested with EmDash 1.0.1. This is an original TypeScript implementation, not the PHP WPForms plugin. It does not yet provide complete WPForms premium parity.

## Registry and native installation

The engine is a sandboxed registry-format bundle. It includes Block Kit management, typed API routes, MCP tools, form definitions and entry storage. Registry users can create templates, edit JSON definitions, publish/pause and inspect responses.

The `@emdash-forms/ui` companion renders forms on the site: the Form content block, the `<Form>` Astro component and `/forms/<id>`. It requires a site build and deployment and can't be installed through the sandbox registry. All form management happens in this plugin's admin.

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

## Admin

**Plugins › Forms** lists every form with its status and unread/total response counts. Each form has these tabs:

- **Fields:** add, edit, reorder and remove fields; set required, width, choices, limits, calculations and "only show when…" conditions.
- **Settings:** title, introduction, submit button text, confirmation message, notification emails, layout and open/close dates.
- **Responses:** browse responses, open one to read it (which marks it read), star it, add private notes, archive or delete it, and export CSV.
- **Embed:** the form ID and copy-ready snippets for the Form block, Astro component and JSON API.
- **Advanced:** edit the full definition as JSON.

Edits are saved to a draft. Visitors see them after you publish. A dashboard widget shows recent responses.

## Release

Published as `@netdollar.dev/forms` (publisher `did:plc:zfm2t2bsxltpu44kc7g3eyn4`). From this directory, run `pnpm exec emdash-plugin bundle` to validate and then `pnpm exec emdash-plugin publish`. Bump the version in `package.json` for every release, because published versions are immutable. The official CLI is pinned to 0.13.1.

The engine imports Zod through the package-internal `#zod` alias (`zod/mini`) so the CLI inlines it and `backend.js` stays under the registry's 128 KB per-file limit.

Data lives in the engine installation's namespace. Bind the companion to the actual installed plugin ID shown on each form's Embed tab. Switching IDs does not migrate forms or entries.

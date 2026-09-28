# EmDash registry implications

Reviewed 28 September 2026 against live documentation and the local EmDash 0.42.0 installation.

## Decision

Use the official registry for the sandboxed forms engine. Keep the native Forms Studio companion for the visual editor and public Astro form rendering. Add Block Kit management directly to the engine, so registry users can create templates, edit validated definitions, publish/pause forms and read responses without installing browser code.

This changes the installation emphasis, not the execution boundary. A complete visual forms product still requires a native package installation and site deployment. Do not advertise the registry engine as a one-click installation of the entire WPForms-style experience.

## What the registry supplies

The supported catalog is the registry at plugins.emdashcms.com. Sites with a sandbox runner use registry.emdashcms.com by default. Public package names combine an Atmosphere handle and slug; stable publisher identity is resolved separately. The host validates bundle metadata and permissions before presenting installation consent. Expanded authority on updates requires renewed review. Plugin storage can survive uninstall.

Source: https://docs.emdashcms.com/plugins/registry/

The old marketplace configuration is a migration concern, not the starting point for new distribution. Marketplace and registry installs can have separate runtime/storage identities; changing discovery configuration does not migrate existing plugin data.

Source: https://docs.emdashcms.com/plugins/migrate-from-marketplace/

## Format constraints

Only sandboxed plugins are registry-installable. Block Kit is host-rendered declarative UI; it does not execute our React editor. Custom React administration, Astro render components and custom Portable Text block definitions remain native capabilities. A hosted iframe is not a built-in Block Kit control and does not remove this boundary.

Use json-render inside the installed native companion with a closed component catalog. It composes already implemented components; it is not an alternative installation mechanism. AI and human administration share validated engine operations and revision checks.

Source: https://docs.emdashcms.com/plugins/creating-plugins/choosing-a-format/

## Release engineering implications

Use the official CLI and pin its version while the registry contract is experimental. Publishing requires the real publisher's Atmosphere identity, license, author and security contact. Direct CLI publishing and the GitHub release service are supported; a separate artifact service is optional. The documented tarball budgets are 256 KiB total decompressed, 128 KiB per file, and 20 files. Both code and generated tool schemas must fit.

Our development identity is deliberately non-publishable. Release metadata and real publisher credentials must be configured before a public release. Do not invent the user's account or claim a local bundle is publicly listed.

Source: https://docs.emdashcms.com/plugins/creating-plugins/publishing/

## Installation paths

1. Registry engine: configure the sandbox runner, review and install the release through EmDash. Native companion remains optional for API/agent users, required for our visual builder and Astro embedding.
2. Full product: install the native companion and bind it to the explicit approved engine runtime ID. Build and deploy the site. Do not guess runtime identity from a display handle or silently create a second engine with separate data.
3. Local development: use the CLI-generated engine descriptor and workspace companion. This exercises a config-declared sandbox, not a registry download. A registry lifecycle test is a separate acceptance gate.

Engine and companion must verify API compatibility and fail explicitly on missing/mismatched engines. Data belongs to the engine's installation namespace. Moving between configuration and registry installation needs an explicit export/import migration.

## Current implementation and remaining proof

The engine contains typed definitions, revision-protected drafts/publication, conditional validation, calculations, submission tickets, entry storage, email notification state and MCP operations. The companion contains a json-render visual builder and public React renderer. The registry change adds a Block Kit management screen using the same engine operations.

Required verification: complete bundle size validation; real sandbox tests; host authorization/CSRF tests; browser creation/submission/retrieval; packed-package installation; registry identity binding; and a real publisher release. No current artifact establishes all premium WPForms features or public marketplace availability.

## Verified implementation update

The engine bundle passes official validation at 193.2 KB across three files. Seven automated tests pass. Packed packages install and build in a clean temporary site using the packaged installer. Chrome verified creation, publication, visitor submission and private entry retrieval. See forms-verification.md for precise scope and remaining release gates.

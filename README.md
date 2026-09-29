# EmDash Forms

One native EmDash plugin for building forms visually, publishing them on your site, and managing responses. One package, one configuration entry, one admin page.

## Included

- Drag fields from a 17-type palette; reorder with drag-and-drop or keyboard-accessible buttons.
- Field settings, required rules, conditional logic, calculations and multi-step forms.
- Interactive desktop/mobile previews that never save responses or send emails.
- Contact, survey, application and blank templates; JSON import/export.
- Draft/published separation, revision-protected saves, schedules and pause controls.
- Response inbox, private notes, starring, status changes and CSV export.
- Public Astro component, content-editor Form block and standalone form pages.
- Ten MCP operations using the same validation and revision checks as the editor.

## Install

Development release: `@emdash-forms/plugin` is not yet published. Build and pack locally first:

```sh
pnpm install
pnpm forms:build
pnpm --filter @emdash-forms/plugin pack
```

Install the resulting tarball in your EmDash site. Then run:

```sh
pnpm exec emdash-forms          # inspect the proposed changes
pnpm exec emdash-forms --apply # back up config and apply
pnpm build
```

Or register manually in your existing Astro/EmDash configuration:

```js
import { forms } from "@emdash-forms/plugin";
// Inside emdash({...}), preserving other existing plugins:
plugins: [forms()]
```

This is **trusted native site code**, not a sandboxed registry installation. Installing or updating it requires a site build/deploy. Form content changes after installation do not require a redeploy. EmDash authentication, permissions, CSRF protections and scoped storage still apply to private routes; native code itself is not sandbox-isolated.

Open **Plugins → Forms**. Publish a form and add a **Form** block with its ID, or import `Form` from `@emdash-forms/plugin/Form`. See [embedding](docs/embedding.md).

## Migrating the former two-plugin setup

1. Install the combined package.
2. Remove only the Forms engine from `sandboxed` and the old `formsStudio(...)` entry from `plugins`.
3. Register `forms()` once in `plugins`.
4. Update component imports from `@emdash-forms/ui/Form` to `@emdash-forms/plugin/Form`.
5. Build and restart/deploy.

The plugin ID remains `forms`; collection names and the `studio-form` content block type are unchanged. Existing config-declared forms and responses require no data migration. Do not uninstall/purge the old engine's data. Registry installations with a publisher-qualified ID need a separately verified data migration; the installer deliberately refuses to guess.

## Development

Requires Node.js 22.13+ (24 LTS recommended), pnpm 11, EmDash 1.x and Astro 7.

```sh
pnpm forms:check
pnpm forms:test
pnpm forms:build
```

- `packages/forms-ui`: the single distributable `@emdash-forms/plugin`; includes native runtime, visual admin and public rendering.
- `packages/forms-engine`: private domain implementation and runtime/security test fixture. Its code is bundled into the public package; consumers do not install or register another plugin.
- `docs/`: installation, architecture and verification notes.

## Scope

An early functional forms product, not a claim of complete Contact Form 7/WPForms feature parity. Payments, uploads, CRM integrations, save-and-resume and importers for other form products are not implemented. Email delivery requires a configured EmDash transport. Pointer-based signatures are not an accessible e-signature workflow. See [architecture and remaining work](docs/forms-plugin-architecture.md).

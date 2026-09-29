# EmDash Forms — one native plugin

`@emdash-forms/plugin` combines the Forms engine, React drag-and-drop builder, interactive previews, response inbox and Astro public renderer. This folder retains its historical name; it is no longer a UI companion.

Register exactly one plugin:

```js
import { forms } from "@emdash-forms/plugin";
// Inside emdash({...}):
plugins: [forms()]
```

No separate engine registration, sandbox runner or engine ID configuration is required for Forms. Preserve sandbox configuration if other plugins use it.

## Setup

This development package is not yet published. Install a locally packed artifact, then run `pnpm exec emdash-forms` to inspect the installation plan. Run again with `--apply` to back up and edit the supported Astro configuration and add `/forms/[id]`. Existing or ambiguous installations fail with migration guidance.

Requires server-rendered Astro, the React integration and EmDash 1.x. Build and deploy the site after installation. Native plugins are trusted application code, not sandbox-isolated registry plugins.

## Public form

```astro
---
import Form from "@emdash-forms/plugin/Form";
---
<Form formId="contact-us-4f2a" />
```

Alternatively insert the **Form** content block. Keep the stored `studio-form` block type and `forms` plugin ID when migrating; this preserves existing content and storage.

## Editor

Open **Plugins → Forms**. Create a template, drag or click fields to add them, configure properties and use Preview to test. Preview applies the same conditions, validation, calculations and steps as the public form but makes no submission requests. Save draft does not alter the published snapshot; Publish makes it live. Settings contains embed information and availability controls.

See the repository README for migration instructions and known limitations. The package includes the backend at build time; `@emdash-forms/engine` is a development-only dependency, not a second installation.

# Forms Studio companion

Native visual editor and Astro renderer for the Forms engine. Development release 0.1.0 targets EmDash 0.42.x. Registry installation cannot supply React/Astro code, so adding this package requires a site build and deployment.

## Install with a registry engine

Install the approved engine release through EmDash's registry first. Record the installed runtime ID from the plugin details/API; do not use the publisher's display handle or assume it is `forms-engine`.

After obtaining the published packages (or local packed development artifacts):

```sh
pnpm add @emdash-forms/ui@0.1.0
pnpm exec emdash-forms --engine-id <installed-runtime-id>
pnpm exec emdash-forms --engine-id <installed-runtime-id> --apply
pnpm build
```

The first setup command prints a JSON plan. `--apply` backs up the Astro configuration, adds the native plugin, and creates `/forms/[id]`. It fails on ambiguous configurations or an existing integration. Deploy the built site using its existing deployment process.

These package names are not yet publicly published. Use packed artifacts for local testing; do not expect a registry search or npm install to find a released product yet.

## Manual integration

```js
import { formsStudio } from "@emdash-forms/ui";
// Within the existing emdash({...}) configuration:
plugins: [formsStudio({ engineId: "the-actual-installed-id" })]
```

Keep the existing plugin list and sandbox runner. The companion checks its engine's API version before use. It never silently switches engines.

The admin entry is `/_emdash/admin/plugins/forms-studio/forms`. Insert a Forms Studio Portable Text block with a published form ID, or use the exported Astro component:

```astro
---
import Form from "@emdash-forms/ui/Form";
---
<Form formId="f..." />
```

Human screens and agent tools use the same revision-protected engine routes. json-render composes a bounded set of local components and does not require an AI provider.

## Current limits

The import button accepts this project's form definition JSON, not WPForms exports. Payment providers, file uploads, save-and-resume, CRM/marketing providers, registration workflows and the remaining premium feature inventory are not implemented. Signature capture currently uses a pointer canvas. Notifications depend on a configured host email transport. This is a development implementation, not a completed premium replacement.

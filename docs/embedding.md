# Adding forms to your site

Forms has two parts:

| Part | Where it comes from | What it does |
| --- | --- | --- |
| **Forms** (`@netdollar.dev/forms`) | EmDash plugin registry, one-click install | Build and publish forms, collect and manage responses, JSON API, MCP tools |
| **Site package** (`@netdollar/emdash-forms`) | npm, installed once per site | Shows forms on your pages: Form block, `<Form>` component, `/forms/<id>` |

EmDash runs registry plugins in a secure sandbox. The sandbox can't add HTML, scripts or styles to your pages, and the content editor's HTML block strips `<form>` elements. That's why rendering ships as a separate site package.

Every form's **Embed** tab in the admin shows its form ID and ready-to-copy snippets.

## One-time setup

Requirements: a server-rendered Astro site (`output: "server"`) with the React integration, the EmDash sandbox runner configured, and Forms installed from the registry.

```sh
pnpm add @netdollar/emdash-forms
pnpm exec emdash-forms          # prints the planned changes
pnpm exec emdash-forms --apply  # applies them
```

The installer adds `forms()` to `astro.config.mjs` (keeping a backup) and creates `src/pages/forms/[id].astro`. Build and deploy the site afterwards.

`forms()` connects to the registry install automatically. For any other install, pass the plugin ID from the Embed tab: `forms({ engineId: "…" })`.

## In the content editor

Insert a **Form** block where you want the form and enter the form ID, for example `contact-us-4f2a`.

## In templates

```astro
---
import Form from "@netdollar/emdash-forms/Form";
---
<Form formId="contact-us-4f2a" />
```

## JSON API for custom front ends

All routes live under `/_emdash/api/plugins/<plugin-id>/`. The plugin ID is shown on the Embed tab.

1. `GET definition?id=<form-id>` returns the published definition, without notification recipients.
2. `POST ticket` with `{"id":"<form-id>"}` returns a single-use submission ticket.
3. Wait at least 1.5 seconds, then `POST submit` with `{"formId","ticket","website":"","answers":{…}}`. `website` is a honeypot and must stay empty.

Responses are wrapped as `{ success, data }`. Domain errors appear in `data` as `{ ok: false, code, message, fields? }`. Tickets expire after an hour and are tied to a form version. The server re-checks required fields, conditions and calculations, and rejects hidden or computed values sent by the client.

Plain HTML pasted into the content editor isn't a supported embed path. Use the Form block or the component.

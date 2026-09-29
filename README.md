# EmDash Forms

Forms for EmDash: build contact forms, surveys and multi-step applications in the admin, put them on any page, and manage the responses.

Forms comes in two parts:

| Part | Install from | What it does |
| --- | --- | --- |
| **Forms**, `@netdollar.dev/forms` ([packages/forms-engine](packages/forms-engine)) | EmDash plugin registry | Admin for building and publishing forms, response inbox, CSV export, email notifications, JSON API, MCP tools |
| **Site package**, `@netdollar/emdash-forms` ([packages/forms-ui](packages/forms-ui)) | npm, once per site | Renders forms on the site: **Form** content block, `<Form>` Astro component, `/forms/<id>` pages |

EmDash runs registry plugins in a secure sandbox that can't add HTML or scripts to your pages, so rendering ships as the separate site package. See [docs/embedding.md](docs/embedding.md).

## Included

- 17 field and layout types, including choices, ratings, NPS, signatures, calculations, section headings and page breaks
- Required fields, "only show when…" conditions, multi-step and one-question-at-a-time layouts
- Contact, feedback, job application and blank templates
- Drafts kept separate from the published version, with revision-protected saves, open/close dates and pause/resume
- Response inbox with read/unread, stars, private notes, archive, delete and CSV export
- Email notifications (needs an EmDash email provider)
- Spam protection: single-use tickets, minimum completion time, honeypot and duplicate detection
- A dashboard widget for recent responses, and MCP tools so AI agents can manage forms and responses

## Install

1. Install **Forms** from the EmDash plugin registry. Your site needs the sandbox runner configured.
2. Add the site package once:

   ```sh
   pnpm add @netdollar/emdash-forms
   pnpm exec emdash-forms --apply
   ```

3. Build and deploy. Then create a form under **Plugins › Forms**, publish it, and insert a **Form** block into a page.

## Development

Requires Node.js 22.13+ (24 recommended) and pnpm 11. Tested with EmDash 1.0.1 and Astro 7.

```sh
pnpm install
pnpm forms:check   # typecheck both packages
pnpm forms:test    # engine tests run inside the real EmDash sandbox
pnpm forms:build
```

Release:

```sh
pnpm --filter @emdash-forms/engine release            # publish to the EmDash registry
pnpm --filter @netdollar/emdash-forms publish         # publish to npm
```

Bump both versions for each release, because published versions can't be changed.

## Scope

An early release, not full Contact Form 7 or WPForms parity. Payments, file uploads, CRM integrations, save-and-resume and importers from other form plugins aren't implemented yet. Public deployments should add rate limiting in front of the submit route.

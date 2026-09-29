# Embedding Forms

Install and register the combined native `@emdash-forms/plugin` once. No companion or separate sandboxed engine is needed.

## In content

Open **Plugins → Forms**, edit your form and publish it. Under **Settings → Embed this form**, copy its ID. Insert a **Form** block into your page/post and paste the ID. Only published, open forms accept responses.

## In an Astro template

```astro
---
import Form from "@emdash-forms/plugin/Form";
---
<Form formId="contact-us-4f2a" />
```

The guided `emdash-forms --apply` installer also creates `src/pages/forms/[id].astro`, giving each form a standalone `/forms/<id>` page. The component alone does not create routes automatically.

Build/deploy the site after initial installation or package upgrades. Subsequent form edits are stored in EmDash and become public when published.

## Custom front ends

The public JSON API is rooted at `/_emdash/api/plugins/forms/`:

1. `GET definition?id=<id>` returns the published definition, with notification recipients removed.
2. `POST ticket` with `{"id":"<id>"}` returns a submission ticket and version. Ensure it matches the definition version.
3. Wait at least 1.5 seconds. `POST submit` with `{"formId":"<id>","ticket":"<ticket>","website":"","answers":{}}`.

The host wraps responses as `{success,data}`. Domain errors appear in `data` as `{ok:false,code,message,fields?}`. HTTP authentication and host failures may use non-2xx status codes.

Tickets expire after one hour and are bound to a form version. Reusing a successful ticket with the same answers is idempotent; changing the answers is rejected. The server independently validates answers, computes calculated fields and rejects hidden/computed answers supplied by the client.

## Preview vs public form

The admin preview is interactive but does not request tickets, save responses or send emails. Use an actual published form for submission testing. Paused, scheduled and closed forms are enforced by the public API.

Plain HTML pasted into the content editor is not a supported embed path; use the Form block or component.

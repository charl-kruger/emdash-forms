# @netdollar/emdash-forms

Show [EmDash Forms](https://plugins.emdashcms.com/plugins/@netdollar.dev/forms) on your site. You build and manage forms in the **Forms** plugin, installed from the EmDash registry. This package renders them on your pages:

- a **Form** block for the content editor, much like a Contact Form 7 shortcode
- a `<Form formId="…" />` Astro component for templates and layouts
- a page at `/forms/<id>` for every published form

EmDash runs registry plugins in a secure sandbox that can't add HTML or scripts to your pages, which is why rendering ships as this small site package. You install it once. After that, every form you publish works without another deploy.

## Requirements

- EmDash 1.x on a server-rendered Astro site (`output: "server"`) with the React integration
- A configured sandbox runner (`sandboxRunner`), with **Forms** (`@netdollar.dev/forms`) installed from the registry

## Install

```sh
pnpm add @netdollar/emdash-forms
pnpm exec emdash-forms          # preview the changes
pnpm exec emdash-forms --apply  # apply them
```

The installer adds `forms()` to the `plugins` list in `astro.config.mjs` (it keeps a backup) and creates `src/pages/forms/[id].astro`. It stops rather than guessing if your config has an unusual shape. Build and deploy your site afterwards.

To set it up by hand, add this inside `emdash({...})`:

```js
import { forms } from "@netdollar/emdash-forms";

plugins: [forms()],
```

`forms()` connects to the registry install of Forms by default. If you installed Forms another way, pass the plugin ID shown on any form's **Embed** tab: `forms({ engineId: "..." })`, or `pnpm exec emdash-forms --engine-id <id>`.

## Use

- **Content editor:** insert a **Form** block and enter the form ID from the form's **Embed** tab.
- **Templates:**

  ```astro
  ---
  import Form from "@netdollar/emdash-forms/Form";
  ---
  <Form formId="contact-us-4f2a" />
  ```

Only published forms render. A paused or closed form shows a short message instead.

## License

MIT

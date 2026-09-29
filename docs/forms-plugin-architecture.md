# Forms architecture: one installation, two execution boundaries

> **Current decision — 29 September 2026:** Forms is now one trusted native plugin, `@emdash-forms/plugin`, registered once as `forms()`. It bundles the private engine, React builder and Astro renderer. The split-plugin/registry architecture below is historical, not installation guidance. See the root README and `docs/combined-plugin.md` for the current design and verification.

> **Superseded (29 September 2026):** the companion no longer has its own admin, React builder or json-render views. All management happens in the registry plugin's Block Kit admin, and the companion only renders forms on the site. See [embedding.md](embedding.md).

Date: 2026-09-28. Status: implementation in progress; see forms-registry-analysis.md for the registry decision and remaining verification.

## Decision

Deliver the forms product through one guided installation that coordinates a sandboxed engine and a trusted UI companion. Keep forms and entries on the customer's EmDash installation by default. Support agents through explicit typed operations, and humans through a stable visual builder over those same operations.

The user has authorized broader approaches, including hosting and JSON-rendered administration. We do not need another native-versus-sandbox choice. The implementation should first prove the two-package integration with one real form, then build the requested premium feature set.

## What EmDash already supplies

Lifecycle hooks, plugin storage and KV, settings, admin pages, widgets, custom blocks and routes are real EmDash features. They are not all exposed to both plugin formats. Sandboxed plugins use Block Kit for UI; custom React and Astro rendering require native code. Dynamic Worker Loader isolates server execution; it does not load arbitrary plugin React components into the administrator's browser.

Verified through live `search_docs`: [format capabilities](https://docs.emdashcms.com/plugins/creating-plugins/choosing-a-format/), [Block Kit](https://docs.emdashcms.com/plugins/creating-plugins/block-kit/), [native distribution](https://docs.emdashcms.com/plugins/creating-native-plugins/distributing/).

## Product components

| Component | Responsibility | Installation boundary |
| --- | --- | --- |
| Forms engine | Versioned definitions, validation, submissions, reporting, provider operations, settings, hooks and MCP tools | Sandboxed plugin |
| Forms UI companion | React builder, json-render catalog, EmDash admin integration, Astro/public form renderer and content block | Trusted native package |
| Installer | Compatibility checks, explicit package versions, configuration edits, build validation and installation receipt | Local CLI usable by a person or agent |
| Optional hosted service | Managed deployment or selected heavy services with explicit configuration | Separate later deployment mode |

Start with a forms-specific companion. Extract a reusable UI host only after another plugin demonstrates shared requirements. Building an entire alternative marketplace or arbitrary plugin browser runtime first would delay the forms product without proving its installation flow.

## Human installation

The initial guided installer adds the companion, configures the sandbox runner where required, registers the engine, validates compatibility and builds the site. Activation and first-run setup occur in EmDash. The setup screen must distinguish missing provider configuration from a working feature.

For a deployed site, the initial companion installation requires a deployment. Subsequent engine releases can use the registry's supported update flow, subject to companion compatibility. New compiled UI components require a companion update and deployment. Do not describe every future feature as a zero-deploy update.

Distribution should include a conventional manual npm/config path alongside the guided installer, both specifying the same explicit versions and configuration. This is two supported installation interfaces, not a silent runtime recovery mechanism.

## Agent installation and operation

An agent with project access can run the same installer and inspect a machine-readable result. The installer should report installed versions, configuration changes, checks, required deployment and any unresolved steps. It must stop on unsupported versions, ambiguous configuration, or failed validation.

An agent with only site MCP/API access cannot install new trusted source into a deployment. Once the companion is installed, authorized agents can manage engine operations through the site's supported APIs and plugin MCP tools. Verify the host's supported installation API independently; do not invent a plugin-install MCP tool.

Expose bounded operations for creating and revising drafts, managing fields and logic, validating a form, publishing a revision, previewing, querying entries and exporting. The visual builder invokes the same service operations. Authentication and permission checks remain server-side, regardless of whether the caller is a button or an AI agent.

## json-render's role

[json-render](https://github.com/vercel-labs/json-render) maps schema-constrained JSON specifications to pre-registered components and actions. Use it inside our installed companion, not as a replacement for an EmDash capability.

Define a bounded catalog containing forms-specific components: form canvas, field palette, field editor, condition editor, entry table, integration settings and report views. Implement their actual interactions and accessibility in React. JSON can compose these components; it does not supply a drag-and-drop engine by itself.

Separate three contracts:

1. **Form definition:** durable domain data describing fields, validation, logic and behavior.
2. **Admin view specification:** a versioned JSON presentation of approved components and named actions.
3. **Operation schema:** validated inputs and explicit results for server-side changes.

Ordinary admin screens use deterministic specifications and work without a model connection. An optional AI assistant proposes form changes or tailored views using the same catalog. Validate generated output before rendering or applying it, and show draft changes before publication. AI must not generate arbitrary executable code, endpoint URLs or authorization rules.

Unsupported components, actions and versions produce explicit errors. Validate JSON structure, sizes, nesting, props and action arguments on the relevant boundaries. The renderer is not an authorization mechanism.

## Engine-to-companion contract

Bind the companion to the known forms engine ID and explicit routes. Do not build an unrestricted proxy that lets JSON choose arbitrary plugin routes, headers or browser fetch destinations.

The engine publishes its API/schema version and supported feature identifiers. The companion declares compatible ranges and catalog versions. Check compatibility before presenting editing controls and before writes. Preserve revision checks so simultaneous human and agent edits cannot overwrite each other silently.

Registry runtime identity can differ from a local/config identity; verify the identity mapping through an actual installed artifact. The companion must resolve the approved engine instance, not guess URLs from a publisher string. This is a prototype acceptance requirement.

Secrets stay in encrypted engine settings. Public rendering receives an intentionally limited public definition. Entries and private integration configuration must never be included in that definition or in model prompts by default.

## Hosted administration and iframes

A hosted dashboard is a viable explicit deployment mode, but does not by itself solve embedding a screen into EmDash. Current Block Kit does not expose a general iframe component. Without a native companion, use a supported external link; with the companion, a hosted iframe is possible after browser-policy and authentication validation.

If implemented, isolate the hosted origin, configure frame permissions narrowly, validate message origin and source, and use short-lived, audience-bound authorization. Do not put an EmDash admin token in a URL or hand broad site credentials to the iframe. Prefer a narrowly defined broker protocol over a generic API proxy.

Hosted execution also creates a data-location and availability choice. It should be selected explicitly. The self-hosted product must not secretly switch to a remote service when an operation fails.

For the initial version, use local administration and rendering. Hosting can later offer managed convenience or isolated services such as document generation. Introducing tenancy, remote authentication and synchronization is unnecessary to prove a forms plugin.

## First implementation proof

Before expanding the premium feature list, verify the actual installation boundary:

1. Build a genuine sandboxed engine artifact and native companion package.
2. Install both into this EmDash 0.42.0 fixture with an explicit version mapping.
3. Show an authenticated admin screen through the companion; render a validated json-render specification with a custom field-editor component.
4. Create and edit a form through both the human screen and an authorized agent-facing operation.
5. Embed the published form through the companion, submit it anonymously, and read the stored entry through authenticated administration.
6. Verify role/CSRF enforcement, invalid-input errors, stale revisions, incompatible versions and engine deactivation.
7. Repeat installation from packed artifacts in a clean fixture; a workspace-only success is insufficient.

This proof establishes the delivery model. It is not WPForms premium parity. The broader inventory and provider verification requirements remain in `forms-plugin-research.md`.

## Archive inspection

The supplied WPForms Lite 2.0.2.1 ZIP contains 4,856 files and no `pro/` or `src/Pro/` source tree. Its form export implementation emits an array of form data; its agent-facing mutator separates form creation, field creation/update and settings updates. These are useful migration and operation-design references. A real exported form should later be used as an importer fixture; archive inspection alone does not prove importer compatibility.

No attached source instructions were adopted as project instructions. No PHP or archive build scripts were executed, and no WPForms implementation code was copied into a new plugin.

import type { PluginContext, RouteEntry } from "emdash/plugin";
import type { Block, BlockResponse } from "@emdash-cms/blocks";
import { z } from "#zod";
import { answerText, definitionSchema, entrySchema, formRecordSchema, idSchema } from "./schema";
import type { Entry, Field, FieldType, FormDefinition, FormRecord } from "./schema";
import { newField, templates } from "./templates";

// Block Kit admin for registry installs. Every change goes through the same
// validated, revision-protected routes used by the API and MCP tools.

const interaction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page_load"), page: z.string() }),
  z.object({ type: z.literal("block_action"), action_id: z.string(), value: z.optional(z.unknown()), page: z.optional(z.string()) }),
  z.object({ type: z.literal("form_submit"), action_id: z.string(), values: z.record(z.string(), z.unknown()), page: z.optional(z.string()) }),
]);
const resultSchema = z.looseObject({ ok: z.boolean(), message: z.optional(z.string()) });
const formResult = z.object({ id: idSchema, revision: z.string(), record: formRecordSchema });
const formPage = z.object({ items: z.array(z.object({ id: idSchema, record: formRecordSchema })), cursor: z.optional(z.nullable(z.string())), hasMore: z.boolean() });
const entryPage = z.object({ items: z.array(z.object({ id: z.string(), entry: entrySchema })), cursor: z.optional(z.nullable(z.string())), hasMore: z.boolean() });
const entryResult = z.object({ id: z.string(), revision: z.string(), entry: entrySchema });
const pageValue = z.optional(z.looseObject({ cursor: z.optional(z.string()) }));

type OperationName = "list" | "create" | "get" | "save" | "publish" | "pause" | "resume" | "delete" | "entries" | "entry" | "entry-update" | "entry-delete" | "export";
type Operations = Record<OperationName, Exclude<RouteEntry, (...args: never[]) => unknown>>;
type FormFieldElement = Extract<Block, { type: "form" }>["fields"][number];
type Loaded = z.infer<typeof formResult>;

/** Plugin ID EmDash assigns to @netdollar.dev/forms installed from the registry. */
const REGISTRY_ID = "r_yi3qllvcosfhr4ld";
const TABS = { fields: 0, settings: 1, responses: 2, embed: 3, advanced: 4 } as const;
type Tab = keyof typeof TABS;

export const fieldTypes: { type: FieldType; label: string }[] = [
  { type: "text", label: "Short text" }, { type: "textarea", label: "Paragraph" }, { type: "email", label: "Email" },
  { type: "tel", label: "Phone" }, { type: "url", label: "Website" }, { type: "number", label: "Number" },
  { type: "date", label: "Date" }, { type: "select", label: "Dropdown" }, { type: "radio", label: "Multiple choice" },
  { type: "checkboxes", label: "Checkboxes" }, { type: "consent", label: "Consent checkbox" }, { type: "rating", label: "Star rating" },
  { type: "nps", label: "NPS score (0–10)" }, { type: "signature", label: "Signature" }, { type: "calculation", label: "Calculation" },
  { type: "section", label: "Section heading" }, { type: "page", label: "Page break" },
];
const typeLabel = (type: FieldType) => fieldTypes.find(t => t.type === type)?.label ?? type;
const operators = [
  { value: "equals", label: "is" }, { value: "not-equals", label: "is not" }, { value: "contains", label: "contains" },
  { value: "filled", label: "is filled in" }, { value: "empty", label: "is empty" },
] as const;
const answerable = (field: Field) => !["section", "page", "calculation"].includes(field.type);
const hasChanges = (record: FormRecord) => record.published !== null && JSON.stringify(record.draft) !== JSON.stringify(record.published);
function status(record: FormRecord): string {
  if (record.status === "paused") return "Paused";
  if (record.status === "draft") return "Draft";
  return hasChanges(record) ? "Published · edited" : "Published";
}
function summary(entry: Entry): string {
  const parts = entry.fields.filter(answerable).map(f => answerText(f, entry.answers[f.id])).filter(Boolean).slice(0, 2);
  const text = parts.join(" · ");
  return text.length > 80 ? `${text.slice(0, 79)}…` : text || "—";
}
function slug(label: string, taken: Set<string>, fallback: string): string {
  const base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  const root = /^[a-z]/.test(base) ? base : `${fallback}${base ? `_${base}` : ""}`;
  let id = root;
  for (let n = 2; taken.has(id); n++) id = `${root}_${n}`;
  taken.add(id);
  return id;
}
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const num = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const date = (iso: string | null) => iso ? iso.slice(0, 10) : undefined;
const when = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

/** Turn validation failures into a sentence that names the field involved. */
function explain(error: unknown, definition?: FormDefinition): string {
  if (error instanceof z.core.$ZodError) {
    return error.issues.slice(0, 3).map(issue => {
      const [area, index, prop] = issue.path;
      if (area === "fields" && typeof index === "number" && definition?.fields[index]) return `“${definition.fields[index].label}”: ${issue.message}`;
      if (area === "settings" && typeof index === "string") return `${index === "notifications" ? "Notification emails" : index}: ${issue.message}`;
      return prop === undefined && index === undefined ? issue.message : `${issue.path.join(" › ")}: ${issue.message}`;
    }).join(" ");
  }
  return error instanceof Error ? error.message : "Something went wrong";
}
function ruleLabel(rule: { field: string; value: string } | undefined, definition: FormDefinition): string {
  if (!rule) return "";
  const target = definition.fields.find(f => f.id === rule.field);
  return target && "options" in target ? target.options.find(o => o.value === rule.value)?.label ?? rule.value : rule.value;
}
const errorBanner = (error: unknown, definition?: FormDefinition): Block => ({ type: "banner", variant: "error", title: "Not saved", description: explain(error, definition) });

export function adminRoute(operations: Operations): RouteEntry {
  return { permission: "plugins:manage", handler: async (request, ctx: PluginContext): Promise<BlockResponse> => {
    const input = interaction.parse(request.input);
    const call = async (name: OperationName, data: unknown) => {
      const result = resultSchema.parse(await operations[name].handler({ ...request, input: data }, ctx));
      if (!result.ok) {
        const issues = z.array(z.object({ path: z.string(), message: z.string() })).safeParse(result.issues);
        throw new Error(issues.success && issues.data.length ? issues.data.map(i => i.message).join(" ") : result.message ?? "Form operation failed");
      }
      return result;
    };
    const load = async (id: string): Promise<Loaded> => formResult.parse(await call("get", { id }));
    const save = async (form: Loaded, definition: FormDefinition) => formResult.parse(await call("save", { id: form.id, revision: form.revision, definition }));

    // ── Forms list ───────────────────────────────────────────────────────────
    const home = async (cursor?: string, notice?: Block): Promise<BlockResponse> => {
      const page = formPage.parse(await call("list", cursor === undefined ? {} : { cursor }));
      const newMenu: Block = { type: "actions", elements: [{ type: "menu", action_id: "new", label: "New form", style: "primary", items: templates.map(t => ({ label: t.title, value: t.id })) }] };
      if (!page.items.length && cursor === undefined) return { blocks: [
        { type: "header", text: "Forms" },
        ...(notice ? [notice] : []),
        { type: "empty", size: "lg", title: "Create your first form", description: "Pick a starting point. You can change every field, message and setting afterwards.",
          actions: templates.map((t, i) => ({ type: "button", action_id: `create:${t.id}`, label: t.title, ...(i === 0 ? { style: "primary" as const } : {}) })) },
      ] };
      const [published, unread] = await Promise.all([ctx.storage.forms!.count({ status: "published" }), ctx.storage.entries!.count({ status: "new" })]);
      const rows = await Promise.all(page.items.map(async ({ id, record }) => {
        const [total, fresh] = await Promise.all([ctx.storage.entries!.count({ formId: id }), ctx.storage.entries!.count({ formId: id, status: "new" })]);
        return { name: record.draft.title, status: status(record), responses: total, unread: fresh || "", updated: record.updatedAt, open: { type: "button", action_id: `open:${id}`, label: "Open" } };
      }));
      return { blocks: [
        { type: "header", text: "Forms" },
        ...(notice ? [notice] : []),
        { type: "stats", items: [{ label: "Published forms", value: published }, { label: "Unread responses", value: unread }] },
        newMenu,
        { type: "table", page_action_id: "forms-page", ...(page.hasMore && page.cursor ? { next_cursor: page.cursor } : {}), columns: [
          { key: "name", label: "Form" }, { key: "status", label: "Status", format: "badge" }, { key: "unread", label: "Unread", format: "number" },
          { key: "responses", label: "Responses", format: "number" }, { key: "updated", label: "Updated", format: "relative_time" }, { key: "open", label: "", format: "element" },
        ], rows },
      ] };
    };

    // ── Single form ──────────────────────────────────────────────────────────
    const formView = async (id: string, tab: Tab = "fields", options: { notice?: Block; cursor?: string; loaded?: Loaded } = {}): Promise<BlockResponse> => {
      const form = options.loaded ?? await load(id);
      const { record, revision } = form;
      const draft = record.draft;
      const rev = revision;
      const stateBanner: Block[] = record.status === "draft"
        ? [{ type: "banner", title: "Not published yet", description: "Visitors can’t see this form until you publish it." }]
        : record.status === "paused" ? [{ type: "banner", variant: "alert", title: "Responses are paused", description: "The form is hidden from visitors. Resume to accept responses again." }]
        : hasChanges(record) ? [{ type: "banner", variant: "alert", title: "You have unpublished changes", description: "Visitors still see the previous version. Publish to update it." }] : [];
      const primary = record.status === "draft" || hasChanges(record)
        ? [{ type: "button" as const, action_id: `publish:${id}:${rev}`, label: record.status === "draft" ? "Publish form" : "Publish changes", style: "primary" as const,
          confirm: { title: record.status === "draft" ? "Publish this form?" : "Publish your changes?", text: "Visitors will see this version of the form straight away.", confirm: "Publish", deny: "Cancel" } }]
        : [];
      const toggle = record.status === "published"
        ? [{ type: "button" as const, action_id: `pause:${id}:${rev}`, label: "Pause responses", confirm: { title: "Pause responses?", text: "The form stops accepting responses until you resume it. Nothing is deleted.", confirm: "Pause", deny: "Cancel" } }]
        : record.status === "paused" && record.published ? [{ type: "button" as const, action_id: `resume:${id}:${rev}`, label: "Resume responses" }] : [];

      // Fields tab
      const fieldRows = draft.fields.map((field, index) => ({
        label: field.type === "page" ? `— ${field.label} (new page) —` : field.type === "section" ? `§ ${field.label}` : field.label,
        type: typeLabel(field.type),
        rules: [field.required ? "Required" : "", field.condition ? "Conditional" : ""].filter(Boolean).join(", "),
        actions: { type: "menu", action_id: `field:${id}:${field.id}:${rev}`, label: "Edit", items: [
          { label: "Edit", value: "edit" }, ...(index > 0 ? [{ label: "Move up", value: "up" }] : []),
          ...(index < draft.fields.length - 1 ? [{ label: "Move down", value: "down" }] : []), { label: "Remove", value: "remove" },
        ] },
      }));
      const fieldsPanel: Block[] = [
        { type: "table", page_action_id: `open:${id}:fields`, columns: [{ key: "label", label: "Field" }, { key: "type", label: "Type" }, { key: "rules", label: "Rules" }, { key: "actions", label: "", format: "element" }], rows: fieldRows },
        { type: "actions", elements: [{ type: "menu", action_id: `add-field:${id}:${rev}`, label: "Add field", style: "primary", items: fieldTypes.map(t => ({ label: t.label, value: t.type })) }] },
        { type: "context", text: "Changes are saved as a draft. Visitors see them after you publish." },
      ];

      // Settings tab
      const settings = draft.settings;
      const settingsPanel: Block[] = [{ type: "form", block_id: "settings", fields: [
        { type: "text_input", action_id: "title", label: "Form title", initial_value: draft.title },
        { type: "text_input", action_id: "description", label: "Introduction", multiline: true, initial_value: draft.description, placeholder: "Shown above the first field (optional)" },
        { type: "text_input", action_id: "submitLabel", label: "Submit button text", initial_value: settings.submitLabel },
        { type: "text_input", action_id: "confirmation", label: "Message after submitting", multiline: true, initial_value: settings.confirmation },
        { type: "text_input", action_id: "notifications", label: "Email new responses to", initial_value: settings.notifications.join(", "), placeholder: "you@example.com, team@example.com" },
        { type: "select", action_id: "mode", label: "Layout", initial_value: settings.mode, options: [{ label: "Classic — all fields on one page (page breaks split steps)", value: "standard" }, { label: "Conversational — one question at a time", value: "conversational" }] },
        { type: "date_input", action_id: "opensAt", label: "Accept responses from (optional)", ...(date(settings.opensAt) ? { initial_value: date(settings.opensAt) } : {}) },
        { type: "date_input", action_id: "closesAt", label: "Stop accepting responses after (optional)", ...(date(settings.closesAt) ? { initial_value: date(settings.closesAt) } : {}) },
      ], submit: { label: "Save settings", action_id: `settings:${id}:${rev}` } },
      { type: "context", text: "Dates use UTC. Email notifications need an email provider configured in EmDash." }];

      // Responses tab (only queried for the first page unless paging)
      const entries = entryPage.parse(await call("entries", { formId: id, ...(options.cursor ? { cursor: options.cursor } : {}) }));
      const responsesPanel: Block[] = [
        { type: "table", page_action_id: `responses-page:${id}`, ...(entries.hasMore && entries.cursor ? { next_cursor: entries.cursor } : {}), empty_text: record.status === "draft" ? "Publish the form to start collecting responses." : "No responses yet.",
          columns: [{ key: "received", label: "Received", format: "relative_time" }, { key: "summary", label: "Response" }, { key: "status", label: "Status", format: "badge" }, { key: "view", label: "", format: "element" }],
          rows: entries.items.map(({ id: entryId, entry }) => ({ received: entry.createdAt, summary: `${entry.starred ? "★ " : ""}${summary(entry)}`, status: entry.status === "new" ? "New" : entry.status === "read" ? "Read" : "Archived", view: { type: "button", action_id: `entry:${entryId}`, label: "View" } })) },
        ...(entries.items.length ? [{ type: "actions" as const, elements: [{ type: "button" as const, action_id: `export:${id}`, label: "Export CSV" }] }] : []),
      ];

      // Embed tab
      const engine = ctx.plugin.id;
      // The site package defaults to this plugin's registry ID; other installs pass it explicitly.
      const installFlag = engine === REGISTRY_ID ? "" : ` --engine-id ${engine}`;
      const embedPanel: Block[] = [
        ...(record.published ? [] : [{ type: "banner" as const, variant: "alert" as const, title: "Publish first", description: "Embedded forms only appear once the form is published." }]),
        { type: "fields", fields: [{ label: "Form ID", value: id }, { label: "Plugin ID", value: engine }] },
        { type: "section", text: "In the content editor: insert a “Form” block into any page or post and enter the form ID above." },
        { type: "section", text: "In an Astro template or layout:" },
        { type: "code", language: "tsx", code: `---\nimport Form from "@netdollar/emdash-forms/Form";\n---\n<Form formId="${id}" />` },
        { type: "section", text: `As its own page: every published form is also available at /forms/${id}` },
        { type: "accordion", label: "One-time setup: add the site package", default_open: !record.published, blocks: [
          { type: "context", text: "EmDash runs registry plugins in a secure sandbox that can’t add HTML or scripts to your pages, so forms are shown by a small site package. Install it once; every form you publish here then works without another deploy." },
          { type: "code", language: "bash", code: `pnpm add @netdollar/emdash-forms\npnpm exec emdash-forms${installFlag}          # preview the changes\npnpm exec emdash-forms${installFlag} --apply  # apply them` },
          { type: "context", text: "Then build and deploy your site as usual." },
        ] },
        { type: "accordion", label: "Use your own front end (JSON API)", blocks: [
          { type: "context", text: "Fetch the definition, request a submission ticket, wait at least 1.5 seconds, then submit. Leave the “website” honeypot empty." },
          { type: "code", language: "bash", code: `GET  /_emdash/api/plugins/${engine}/definition?id=${id}\nPOST /_emdash/api/plugins/${engine}/ticket   {"id":"${id}"}\nPOST /_emdash/api/plugins/${engine}/submit   {"formId":"${id}","ticket":"…","website":"","answers":{…}}` },
        ] },
      ];

      // Advanced tab
      const advancedPanel: Block[] = [
        { type: "context", text: "Edit the complete form definition as JSON. Useful for copying forms between sites. It is validated before saving." },
        { type: "form", block_id: "json", fields: [{ type: "text_input", action_id: "definition", label: "Form definition", multiline: true, initial_value: JSON.stringify(draft, null, 2) }], submit: { action_id: `json:${id}:${rev}`, label: "Validate and save" } },
      ];

      return { blocks: [
        { type: "header", text: draft.title },
        ...(options.notice ? [options.notice] : []),
        ...stateBanner,
        { type: "actions", elements: [...primary, ...toggle,
          { type: "menu", action_id: `more:${id}:${rev}`, label: "More", items: [{ label: "Duplicate", value: "duplicate" }, { label: "Delete form…", value: "delete" }] },
          { type: "button", action_id: "home", label: "All forms" }] },
        { type: "fields", fields: [{ label: "Status", value: status(record) }, { label: "Form ID", value: id }, { label: "Last saved", value: when(record.updatedAt) }] },
        { type: "tab", default_tab: TABS[tab], panels: [
          { label: `Fields (${draft.fields.length})`, blocks: fieldsPanel },
          { label: "Settings", blocks: settingsPanel },
          { label: "Responses", blocks: responsesPanel },
          { label: "Embed", blocks: embedPanel },
          { label: "Advanced", blocks: advancedPanel },
        ] },
      ] };
    };

    // ── Field editor ─────────────────────────────────────────────────────────
    const fieldEditor = async (id: string, fieldId: string, options: { attempt?: Field; notice?: Block } = {}): Promise<BlockResponse> => {
      const form = await load(id);
      const index = form.record.draft.fields.findIndex(f => f.id === fieldId);
      const saved = form.record.draft.fields[index];
      if (!saved) throw new Error("This field no longer exists");
      const field = options.attempt ?? saved;
      const earlier = form.record.draft.fields.slice(0, index).filter(answerable);
      const inputs: FormFieldElement[] = [
        { type: "text_input", action_id: "label", label: field.type === "section" ? "Heading" : field.type === "page" ? "Step title" : "Label", initial_value: field.label },
        { type: "text_input", action_id: "description", label: "Help text", multiline: true, initial_value: field.description, placeholder: "Shown below the label (optional)" },
      ];
      if (answerable(field)) inputs.push({ type: "toggle", action_id: "required", label: "Required", description: "Visitors must answer before submitting", initial_value: field.required });
      if (field.type !== "page") inputs.push({ type: "select", action_id: "width", label: "Width", initial_value: field.width, options: [{ label: "Full width", value: "full" }, { label: "Half width (sits next to another half-width field)", value: "half" }] });
      if ("placeholder" in field) inputs.push(
        { type: "text_input", action_id: "placeholder", label: "Placeholder", initial_value: field.placeholder },
        { type: "number_input", action_id: "maxLength", label: "Maximum characters", initial_value: field.maxLength, min: 1, max: 10000 });
      if (field.type === "number") inputs.push(
        { type: "number_input", action_id: "min", label: "Minimum", initial_value: field.min },
        { type: "number_input", action_id: "max", label: "Maximum", initial_value: field.max },
        { type: "number_input", action_id: "step", label: "Step", initial_value: field.step });
      if (field.type === "rating") inputs.push({ type: "number_input", action_id: "max", label: "Number of stars", initial_value: field.max, min: 2, max: 10 });
      if ("options" in field) inputs.push({ type: "text_input", action_id: "options", label: "Choices — one per line", multiline: true, initial_value: field.options.map(o => o.label).join("\n") });
      if (field.type === "calculation") {
        const numeric = earlier.filter(f => ["number", "rating", "nps"].includes(f.type)).concat(form.record.draft.fields.slice(0, index).filter(f => f.type === "calculation"));
        inputs.push(
          { type: "select", action_id: "operation", label: "Calculate the", initial_value: field.operation, options: [{ label: "Sum", value: "sum" }, { label: "Product", value: "product" }, { label: "Average", value: "average" }] },
          { type: "checkbox", action_id: "fields", label: "Of these fields", initial_value: field.fields, options: numeric.map(f => ({ label: f.label, value: f.id })) },
          { type: "number_input", action_id: "decimals", label: "Decimal places", initial_value: field.decimals, min: 0, max: 6 });
      }
      const complexCondition = field.condition !== null && field.condition.rules.length > 1;
      const rule = field.condition?.rules[0];
      if (earlier.length && !complexCondition) inputs.push(
        { type: "toggle", action_id: "conditional", label: "Only show this field when…", initial_value: field.condition !== null },
        { type: "select", action_id: "ruleField", label: "Field", condition: { field: "conditional", eq: true }, initial_value: rule?.field ?? earlier[earlier.length - 1]!.id, options: earlier.map(f => ({ label: f.label, value: f.id })) },
        { type: "select", action_id: "ruleOperator", label: "Condition", condition: { field: "conditional", eq: true }, initial_value: rule?.operator ?? "equals", options: operators.map(o => ({ ...o })) },
        { type: "text_input", action_id: "ruleValue", label: "Value", condition: { field: "conditional", eq: true }, initial_value: ruleLabel(rule, form.record.draft), placeholder: "For choices, use the choice text" });
      return { blocks: [
        { type: "header", text: `Edit field: ${saved.label}` },
        ...(options.notice ? [options.notice] : []),
        { type: "context", text: `${typeLabel(field.type)} · key “${field.id}” (used in exports and the API)` },
        ...(complexCondition ? [{ type: "banner" as const, title: "Advanced visibility rules", description: "This field uses several conditions. Edit them in the form’s Advanced tab." }] : []),
        { type: "form", block_id: "field", fields: inputs, submit: { label: "Save field", action_id: `field-save:${id}:${field.id}:${form.revision}` } },
        { type: "actions", elements: [{ type: "button", action_id: `open:${id}:fields`, label: "Back to form" }] },
      ] };
    };

    const applyField = (field: Field, values: Record<string, unknown>, definition: FormDefinition): Field => {
      const next = { ...field, label: str(values.label) || field.label, description: str(values.description) } as Field;
      if ("required" in values && answerable(field)) next.required = values.required === true;
      if (values.width === "full" || values.width === "half") next.width = values.width;
      if (next.type === "text" || next.type === "textarea" || next.type === "email" || next.type === "tel" || next.type === "url" || next.type === "date") {
        next.placeholder = str(values.placeholder); next.maxLength = Math.round(num(values.maxLength, next.maxLength));
      }
      if (next.type === "number") { next.min = num(values.min, next.min); next.max = num(values.max, next.max); next.step = num(values.step, next.step); }
      if (next.type === "rating") next.max = Math.round(num(values.max, next.max));
      if (next.type === "select" || next.type === "radio" || next.type === "checkboxes") {
        const taken = new Set<string>();
        const previous = next.options;
        next.options = str(values.options).split("\n").map(line => line.trim()).filter(Boolean).map(label => {
          const existing = previous.find(o => o.label === label && !taken.has(o.value));
          if (existing) { taken.add(existing.value); return existing; }
          return { label, value: slug(label, taken, "option") };
        });
      }
      if (next.type === "calculation") {
        if (values.operation === "sum" || values.operation === "product" || values.operation === "average") next.operation = values.operation;
        next.fields = Array.isArray(values.fields) ? values.fields.filter((v): v is string => typeof v === "string") : next.fields;
        next.decimals = Math.round(num(values.decimals, next.decimals));
      }
      if ("conditional" in values) {
        const target = definition.fields.find(f => f.id === values.ruleField);
        const operator = operators.find(o => o.value === values.ruleOperator)?.value ?? "equals";
        let value = str(values.ruleValue);
        if (target && "options" in target) value = target.options.find(o => o.label === value)?.value ?? value;
        next.condition = values.conditional === true && target ? { mode: "all", rules: [{ field: target.id, operator, value: operator === "filled" || operator === "empty" ? "" : value }] } : null;
      }
      return next;
    };

    // ── Responses ────────────────────────────────────────────────────────────
    const entryView = async (entryId: string, notice?: Block): Promise<BlockResponse> => {
      let loaded = entryResult.parse(await call("entry", { id: entryId }));
      if (loaded.entry.status === "new") {
        const { entry } = loaded;
        loaded = entryResult.parse(await call("entry-update", { id: entryId, revision: loaded.revision, status: "read", starred: entry.starred, notes: entry.notes }));
      }
      const { entry, revision } = loaded;
      const answers = entry.fields.filter(answerable).map(f => ({ label: f.label, value: answerText(f, entry.answers[f.id]) || "—" }));
      const calculations = entry.fields.filter(f => f.type === "calculation").map(f => ({ label: f.label, value: answerText(f, entry.answers[f.id]) || "—" }));
      return { blocks: [
        { type: "header", text: `Response to ${entry.title}` },
        ...(notice ? [notice] : []),
        { type: "fields", fields: [{ label: "Received", value: when(entry.createdAt) }, { label: "Form version", value: String(entry.formVersion) }, ...(entry.notification === "not-requested" ? [] : [{ label: "Email notification", value: entry.notification }])] },
        { type: "divider" },
        { type: "fields", fields: [...answers, ...calculations] },
        ...(entry.fields.some(f => f.type === "signature" && entry.answers[f.id] !== undefined) ? [{ type: "context" as const, text: "Signatures are stored with the response and available through the API." }] : []),
        { type: "divider" },
        { type: "form", block_id: "entry", fields: [
          { type: "select", action_id: "status", label: "Status", initial_value: entry.status, options: [{ label: "Read", value: "read" }, { label: "New (unread)", value: "new" }, { label: "Archived", value: "archived" }] },
          { type: "toggle", action_id: "starred", label: "Starred", initial_value: entry.starred },
          { type: "text_input", action_id: "notes", label: "Private notes", multiline: true, initial_value: entry.notes, placeholder: "Only visible to admins" },
        ], submit: { label: "Save", action_id: `entry-save:${entryId}:${revision}` } },
        { type: "actions", elements: [
          { type: "button", action_id: `open:${entry.formId}:responses`, label: "Back to responses" },
          { type: "button", action_id: `entry-delete:${entryId}:${revision}`, label: "Delete response", style: "danger", confirm: { title: "Delete this response?", text: "This permanently removes the response. It can’t be undone.", confirm: "Delete", deny: "Cancel", style: "danger" } },
        ] },
      ] };
    };

    const exportView = async (id: string, cursor?: string): Promise<BlockResponse> => {
      const form = await load(id);
      const page = z.object({ csv: z.string(), cursor: z.optional(z.nullable(z.string())), hasMore: z.boolean() }).parse(await call("export", { formId: id, ...(cursor ? { cursor } : {}) }));
      return { blocks: [
        { type: "header", text: `Export: ${form.record.draft.title}` },
        { type: "context", text: "Copy this CSV into a spreadsheet or save it as a .csv file. Showing up to 100 responses, newest first." },
        { type: "code", code: page.csv },
        { type: "actions", elements: [
          ...(page.hasMore && page.cursor ? [{ type: "button" as const, action_id: `export:${id}`, label: "Next 100", value: page.cursor }] : []),
          { type: "button", action_id: `open:${id}:responses`, label: "Back to responses" },
        ] },
      ] };
    };

    // ── Dashboard widget ─────────────────────────────────────────────────────
    const widget = async (): Promise<BlockResponse> => {
      const [unread, total] = await Promise.all([ctx.storage.entries!.count({ status: "new" }), ctx.storage.entries!.count()]);
      const recent = await ctx.storage.entries!.query({ orderBy: { createdAt: "desc" }, limit: 5 });
      return { blocks: [
        { type: "stats", items: [{ label: "Unread", value: unread }, { label: "All responses", value: total }] },
        { type: "table", page_action_id: "widget-page", empty_text: "No responses yet.", columns: [{ key: "received", label: "Received", format: "relative_time" }, { key: "form", label: "Form" }, { key: "summary", label: "Response" }],
          rows: recent.items.map(row => { const entry = entrySchema.parse(row.data); return { received: entry.createdAt, form: entry.title, summary: summary(entry) }; }) },
        { type: "actions", elements: [{ type: "link", label: "Open Forms", target: { kind: "plugin-page", path: "/forms" }, appearance: "secondary" }] },
      ] };
    };

    // ── Router ───────────────────────────────────────────────────────────────
    const [action = "", ...args] = input.type === "page_load" ? ["load"] : input.action_id.split(":");
    const rest = (from: number) => args.slice(from).join(":");
    const choice = input.type === "block_action" ? input.value : undefined;
    const values = input.type === "form_submit" ? input.values : {};
    const fail = async (error: unknown, view: (notice: Block) => Promise<BlockResponse>, definition?: FormDefinition): Promise<BlockResponse> => {
      try { return { ...await view(errorBanner(error, definition)), toast: { type: "error", message: "Nothing was saved" } }; }
      catch { return { blocks: [errorBanner(error, definition), { type: "actions", elements: [{ type: "button", action_id: "home", label: "All forms" }] }], toast: { type: "error", message: "Nothing was saved" } }; }
    };
    const done = (response: BlockResponse, message: string): BlockResponse => ({ ...response, toast: { type: "success", message } });

    try {
      if (input.type === "page_load") return input.page.startsWith("widget:") ? await widget() : await home();
      if (input.page?.startsWith("widget:")) return await widget();
      switch (action) {
        case "home": return await home();
        case "forms-page": return await home(pageValue.parse(choice)?.cursor);
        case "new": case "create": {
          const template = templates.find(t => t.id === (action === "new" ? choice : args[0]));
          if (!template) throw new Error("Unknown form template");
          const created = formResult.parse(await call("create", { definition: template.definition }));
          return done(await formView(created.id, "fields", { loaded: created }), "Form created");
        }
        case "open": {
          const tab = (args[1] ?? "fields") as Tab;
          return await formView(idSchema.parse(args[0]), tab in TABS ? tab : "fields");
        }
        case "responses-page": return await formView(idSchema.parse(args[0]), "responses", { cursor: pageValue.parse(choice)?.cursor });
      }
      const id = idSchema.parse(args[0]);
      switch (action) {
        case "publish": case "pause": case "resume": {
          const result = formResult.parse(await call(action, { id, revision: rest(1) }));
          return done(await formView(id, "fields", { loaded: result }), action === "publish" ? "Published" : action === "pause" ? "Responses paused" : "Accepting responses");
        }
        case "more": {
          const form = await load(id);
          if (choice === "duplicate") {
            const created = formResult.parse(await call("create", { definition: { ...form.record.draft, title: `${form.record.draft.title} (copy)`.slice(0, 200) } }));
            return done(await formView(created.id, "fields", { loaded: created }), "Form duplicated");
          }
          const count = await ctx.storage.entries!.count({ formId: id });
          return { blocks: [
            { type: "header", text: `Delete “${form.record.draft.title}”?` },
            { type: "banner", variant: "error", title: "This can’t be undone", description: count ? `The form and its ${count} response${count === 1 ? "" : "s"} will be permanently deleted. Export responses first if you need them.` : "The form will be permanently deleted." },
            { type: "actions", elements: [
              { type: "button", action_id: `delete:${id}:${form.revision}`, label: "Delete form", style: "danger" },
              { type: "button", action_id: `open:${id}`, label: "Cancel" },
            ] },
          ] };
        }
        case "delete": {
          await call("delete", { id, revision: rest(1) });
          return done(await home(), "Form deleted");
        }
        case "settings": {
          const form = await load(id);
          const draft = form.record.draft;
          const notifications = str(values.notifications).split(/[\s,;]+/).filter(Boolean);
          const opens = str(values.opensAt), closes = str(values.closesAt);
          const definition = { ...draft, title: str(values.title) || draft.title, description: str(values.description), settings: {
            ...draft.settings, submitLabel: str(values.submitLabel) || draft.settings.submitLabel, confirmation: str(values.confirmation) || draft.settings.confirmation,
            notifications, mode: values.mode === "conversational" ? "conversational" as const : "standard" as const,
            opensAt: opens ? `${opens.slice(0, 10)}T00:00:00.000Z` : null, closesAt: closes ? `${closes.slice(0, 10)}T23:59:59.000Z` : null,
          } };
          const checked = definitionSchema.safeParse(definition);
          if (!checked.success) return await fail(checked.error, notice => formView(id, "settings", { notice, loaded: form }), definition);
          const saved = await save({ ...form, revision: rest(1) }, checked.data);
          return done(await formView(id, "settings", { loaded: saved }), "Settings saved");
        }
        case "add-field": {
          const form = await load(id);
          const type = fieldTypes.find(t => t.type === choice)?.type;
          if (!type) throw new Error("Unknown field type");
          const existing = form.record.draft.fields;
          const taken = new Set(existing.map(f => f.id));
          const field = newField(type, slug(typeLabel(type), taken, "field"));
          if (type === "page") field.label = "Next step";
          else if (type === "consent") field.label = "I agree to the terms and privacy policy";
          else if (type !== "nps") field.label = typeLabel(type);
          if (field.type === "calculation") {
            field.fields = existing.filter(f => ["number", "rating", "nps", "calculation"].includes(f.type)).map(f => f.id);
            if (!field.fields.length) return await fail(new Error("Add a number, rating or NPS field first. A calculation totals earlier numeric fields."), notice => formView(id, "fields", { notice, loaded: form }));
          }
          // A page break must be followed by a field, so start the new page with a question.
          const added = type === "page" ? [field, { ...newField("text", slug("Short text", taken, "field")), label: "Short text" }] : [field];
          const definition = { ...form.record.draft, fields: [...existing, ...added] };
          const checked = definitionSchema.safeParse(definition);
          if (!checked.success) return await fail(checked.error, notice => formView(id, "fields", { notice, loaded: form }), definition);
          await save({ ...form, revision: rest(1) }, checked.data);
          return done(await fieldEditor(id, field.id), `${typeLabel(type)} added`);
        }
        case "field": {
          const fieldId = idSchema.parse(args[1]);
          if (choice === "edit") return await fieldEditor(id, fieldId);
          const form = await load(id);
          const fields = [...form.record.draft.fields];
          const index = fields.findIndex(f => f.id === fieldId);
          const field = fields[index];
          if (!field) throw new Error("This field no longer exists");
          if (choice === "remove") return { blocks: [
            { type: "header", text: `Remove “${field.label}”?` },
            { type: "context", text: "The field is removed from the draft. Existing responses keep their answers." },
            { type: "actions", elements: [
              { type: "button", action_id: `field-remove:${id}:${fieldId}:${form.revision}`, label: "Remove field", style: "danger" },
              { type: "button", action_id: `open:${id}:fields`, label: "Cancel" },
            ] },
          ] };
          const target = choice === "up" ? index - 1 : index + 1;
          if (target < 0 || target >= fields.length) return await formView(id, "fields", { loaded: form });
          [fields[index], fields[target]] = [fields[target]!, field];
          const definition = { ...form.record.draft, fields };
          const checked = definitionSchema.safeParse(definition);
          if (!checked.success) return await fail(checked.error, notice => formView(id, "fields", { notice, loaded: form }), definition);
          return await formView(id, "fields", { loaded: await save({ ...form, revision: rest(2) }, checked.data) });
        }
        case "field-remove": {
          const fieldId = idSchema.parse(args[1]);
          const form = await load(id);
          if (form.revision !== rest(2)) throw new Error("This form changed. Reload it before removing fields.");
          const definition = { ...form.record.draft, fields: form.record.draft.fields.filter(f => f.id !== fieldId) };
          const checked = definitionSchema.safeParse(definition);
          if (!checked.success) return await fail(checked.error, notice => formView(id, "fields", { notice, loaded: form }), definition);
          return done(await formView(id, "fields", { loaded: await save(form, checked.data) }), "Field removed");
        }
        case "field-save": {
          const fieldId = idSchema.parse(args[1]);
          const form = await load(id);
          if (form.revision !== rest(2)) return await fail(new Error("Someone else changed this form. Review the latest version and try again."), notice => fieldEditor(id, fieldId, { notice }));
          const field = form.record.draft.fields.find(f => f.id === fieldId);
          if (!field) throw new Error("This field no longer exists");
          let attempt = applyField(field, values, form.record.draft);
          let fields = form.record.draft.fields.map(f => f.id === fieldId ? attempt : f);
          // Until a field is published, its key follows its label so exports and the API read naturally.
          if (attempt.label !== field.label && !form.record.published?.fields.some(f => f.id === fieldId)) {
            const key = slug(attempt.label, new Set(fields.filter(f => f.id !== fieldId).map(f => f.id)), "field");
            attempt = { ...attempt, id: key };
            fields = fields.map(f => {
              const next = f.id === fieldId ? attempt : { ...f };
              if (next.condition) next.condition = { ...next.condition, rules: next.condition.rules.map(r => r.field === fieldId ? { ...r, field: key } : r) };
              if (next.type === "calculation") next.fields = next.fields.map(ref => ref === fieldId ? key : ref);
              return next;
            });
          }
          const definition = { ...form.record.draft, fields };
          const checked = definitionSchema.safeParse(definition);
          const shown = { ...attempt, id: fieldId };
          if (!checked.success) return await fail(checked.error, notice => fieldEditor(id, fieldId, { attempt: shown, notice }), definition);
          return done(await formView(id, "fields", { loaded: await save(form, checked.data) }), "Field saved");
        }
        case "json": {
          const form = await load(id);
          let parsed: unknown;
          try { parsed = JSON.parse(str(values.definition)); } catch { return await fail(new Error("That isn’t valid JSON."), notice => formView(id, "advanced", { notice, loaded: form })); }
          const checked = definitionSchema.safeParse(parsed);
          if (!checked.success) return await fail(checked.error, notice => formView(id, "advanced", { notice, loaded: form }));
          return done(await formView(id, "advanced", { loaded: await save({ ...form, revision: rest(1) }, checked.data) }), "Definition saved");
        }
        case "export": return await exportView(id, typeof choice === "string" ? choice : undefined);
        case "entry": return await entryView(id);
        case "entry-save": {
          const entryStatus = z.catch(z.enum(["new", "read", "archived"]), "read").parse(values.status);
          await call("entry-update", { id, revision: rest(1), status: entryStatus, starred: values.starred === true, notes: typeof values.notes === "string" ? values.notes.slice(0, 5000) : "" });
          const current = entryResult.parse(await call("entry", { id }));
          return done(await formView(current.entry.formId, "responses"), "Response updated");
        }
        case "entry-delete": {
          const current = entryResult.parse(await call("entry", { id }));
          await call("entry-delete", { id, revision: rest(1) });
          return done(await formView(current.entry.formId, "responses"), "Response deleted");
        }
      }
      throw new Error("That action isn’t available. Reload the page and try again.");
    } catch (error) {
      // Recover to the form being edited when possible, so the error shows in context.
      const formId = idSchema.safeParse(args[0]);
      const onForm = formId.success && !action.startsWith("entry") && action !== "delete";
      return await fail(error, notice => onForm ? formView(formId.data, "fields", { notice }) : home(undefined, notice));
    }
  } };
}

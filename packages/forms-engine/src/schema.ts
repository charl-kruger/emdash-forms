import { z } from "#zod";

// zod/mini (via the "#zod" import alias, which the plugin CLI inlines) keeps the sandbox bundle within the registry's 128 KB per-file limit.
export const API_VERSION = 1 as const;
export const ENGINE_ID = "forms";
const max = (n: number) => z.string().check(z.maxLength(n));
const bounded = (min: number, maxLen: number) => z.string().check(z.minLength(min), z.maxLength(maxLen));
const int = (min: number, maxValue?: number) => maxValue === undefined ? z.int().check(z.gte(min)) : z.int().check(z.gte(min), z.lte(maxValue));
export const idSchema = z.string().check(z.regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/), z.refine(value => !Object.hasOwn(Object.prototype, value), "Reserved identifier"));
const text = max(2000);
export const answerSchema = z.union([max(100_000), z.number(), z.boolean(), z.array(max(200)).check(z.maxLength(100))]);
export type Answer = z.infer<typeof answerSchema>;
export type Answers = Record<string, Answer>;
export const ruleSchema = z.strictObject({ field: idSchema, operator: z.enum(["equals", "not-equals", "contains", "filled", "empty"]), value: max(200) });
const base = {
  id: idSchema, label: bounded(1, 200), description: text,
  required: z.boolean(), width: z.enum(["full", "half"]),
  condition: z.nullable(z.strictObject({ mode: z.enum(["all", "any"]), rules: z.array(ruleSchema).check(z.minLength(1), z.maxLength(20)) })),
};
const option = z.strictObject({ label: bounded(1, 200), value: bounded(1, 200) });
export const fieldSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.enum(["text", "textarea", "email", "tel", "url", "date"]), placeholder: max(200), maxLength: int(1, 10_000) }),
  z.strictObject({ ...base, type: z.enum(["number", "rating", "nps"]), min: z.number(), max: z.number(), step: z.number().check(z.positive()) }),
  z.strictObject({ ...base, type: z.enum(["select", "radio", "checkboxes"]), options: z.array(option).check(z.minLength(1), z.maxLength(100)) }),
  z.strictObject({ ...base, type: z.literal("consent") }),
  z.strictObject({ ...base, type: z.literal("signature") }),
  z.strictObject({ ...base, type: z.literal("calculation"), operation: z.enum(["sum", "product", "average"]), fields: z.array(idSchema).check(z.minLength(1), z.maxLength(30)), decimals: int(0, 6) }),
  z.strictObject({ ...base, type: z.enum(["section", "page"]) }),
]);
export type Field = z.infer<typeof fieldSchema>;
export type FieldType = Field["type"];
export const definitionSchema = z.strictObject({
  schemaVersion: z.literal(1), title: bounded(1, 200), description: text,
  fields: z.array(fieldSchema).check(z.minLength(1), z.maxLength(100)),
  settings: z.strictObject({
    submitLabel: bounded(1, 80), confirmation: bounded(1, 2000),
    notifications: z.array(z.email()).check(z.maxLength(5)),
    opensAt: z.nullable(z.iso.datetime()), closesAt: z.nullable(z.iso.datetime()),
    mode: z.enum(["standard", "conversational"]),
  }),
}).check(z.superRefine((form, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(form)).byteLength > 48_000) ctx.addIssue({ code: "custom", message: "Form definition exceeds 48 KB", path: [] });
  const ids = new Set<string>();
  const numbers = new Set<string>();
  for (const [index, field] of form.fields.entries()) {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message, path: ["fields", index] });
    if (ids.has(field.id)) issue("Field IDs must be unique");
    if (field.condition) for (const rule of field.condition.rules) if (!ids.has(rule.field)) issue("Conditions must reference an earlier field");
    if (field.type === "calculation") for (const ref of field.fields) if (!numbers.has(ref)) issue("Calculations must reference earlier numeric fields");
    if ("min" in field && field.min > field.max) issue("Minimum cannot exceed maximum");
    if ("options" in field && new Set(field.options.map(o => o.value)).size !== field.options.length) issue("Choice values must be unique");
    if (field.type === "rating" && (!Number.isInteger(field.min) || !Number.isInteger(field.max) || field.min < 1 || field.max > 10 || field.step !== 1)) issue("Ratings must use whole numbers between 1 and 10");
    if (field.type === "nps" && (field.min !== 0 || field.max !== 10 || field.step !== 1)) issue("NPS must use whole numbers from 0 to 10");
    if (field.type === "page" && (index === 0 || index === form.fields.length - 1 || form.fields[index - 1]?.type === "page")) issue("Page breaks must separate fields");
    ids.add(field.id);
    if (["number", "rating", "nps", "calculation"].includes(field.type)) numbers.add(field.id);
  }
  if (!form.fields.some(f => !["page", "section", "calculation"].includes(f.type))) ctx.addIssue({ code: "custom", message: "Add at least one input field", path: ["fields"] });
  if (form.settings.opensAt && form.settings.closesAt && form.settings.opensAt >= form.settings.closesAt) ctx.addIssue({ code: "custom", message: "Closing time must follow opening time", path: ["settings", "closesAt"] });
}));
export type FormDefinition = z.infer<typeof definitionSchema>;
export const formRecordSchema = z.strictObject({
  draft: definitionSchema, published: z.nullable(definitionSchema), publishedVersion: int(0),
  status: z.enum(["draft", "published", "paused"]), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type FormRecord = z.infer<typeof formRecordSchema>;
export const entrySchema = z.strictObject({
  formId: idSchema, formVersion: int(1), title: z.string(),
  answers: z.record(z.string(), answerSchema), fields: z.array(fieldSchema), createdAt: z.iso.datetime(),
  status: z.enum(["new", "read", "archived"]), starred: z.boolean(), notes: max(5000),
  receiptHash: z.string(), notification: z.enum(["not-requested", "pending", "sent", "failed"]),
});
export type Entry = z.infer<typeof entrySchema>;
const revision = bounded(1, 1000);
export const formIdInput = z.strictObject({ id: idSchema });
export const listInput = z.strictObject({ cursor: z.optional(z.string()) });
export const createInput = z.strictObject({ definition: definitionSchema });
export const saveInput = z.strictObject({ id: idSchema, revision, definition: definitionSchema });
export const versionInput = z.strictObject({ id: idSchema, revision });
export const entriesInput = z.strictObject({ formId: idSchema, cursor: z.optional(z.string()) });
export const entryUpdateInput = z.strictObject({ id: idSchema, revision, status: z.enum(["new", "read", "archived"]), starred: z.boolean(), notes: max(5000) });
export const submitInput = z.strictObject({ formId: idSchema, ticket: idSchema, answers: z.record(idSchema, answerSchema), website: max(1000) });
export const ticketSchema = z.strictObject({ formId: idSchema, version: z.int(), issuedAt: z.number(), expiresAt: z.number() });

export function visible(field: Field, answers: Answers): boolean {
  if (!field.condition) return true;
  const results = field.condition.rules.map(rule => {
    const answer = answers[rule.field];
    const empty = answer === undefined || answer === "" || answer === false || (Array.isArray(answer) && answer.length === 0);
    switch (rule.operator) {
      case "empty": return empty;
      case "filled": return !empty;
      case "equals": return Array.isArray(answer) ? answer.includes(rule.value) : !empty && String(answer) === rule.value;
      case "not-equals": return !empty && (Array.isArray(answer) ? !answer.includes(rule.value) : String(answer) !== rule.value);
      case "contains": return Array.isArray(answer) ? answer.includes(rule.value) : typeof answer === "string" && answer.includes(rule.value);
    }
  });
  return field.condition.mode === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function calculated(field: Extract<Field, { type: "calculation" }>, answers: Answers): number | undefined {
  const values: number[] = [];
  for (const id of field.fields) { const value = answers[id]; if (typeof value !== "number" || !Number.isFinite(value)) return undefined; values.push(value); }
  let value = field.operation === "product" ? values.reduce((a,b) => a*b, 1) : values.reduce((a,b) => a+b, 0);
  if (field.operation === "average") value /= values.length;
  if (!Number.isFinite(value)) return undefined;
  return Number(value.toFixed(field.decimals));
}

const emailCheck = z.email();
const urlCheck = z.url({ protocol: /^https?$/ });
export function validateAnswers(form: FormDefinition, input: Answers): { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> } {
  const answers: Answers = {};
  const errors: Record<string,string> = {};
  const ids = new Set(form.fields.map(f => f.id));
  for (const key of Object.keys(input)) if (!ids.has(key)) errors[key] = "Unknown field";
  for (const field of form.fields) {
    if (!visible(field, answers) || field.type === "section" || field.type === "page") {
      if (input[field.id] !== undefined) errors[field.id] = "This field does not accept an answer";
      continue;
    }
    if (field.type === "calculation") {
      if (input[field.id] !== undefined) errors[field.id] = "Calculated values are determined by the server";
      const value = calculated(field, answers);
      if (value === undefined) errors[field.id] = "Complete all inputs for this calculation"; else answers[field.id] = value;
      continue;
    }
    const value = input[field.id];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0) || (field.type === "consent" && value === false)) {
      if (field.required) errors[field.id] = "This field is required";
      continue;
    }
    if ("options" in field) {
      const values = field.type === "checkboxes" ? value : [value];
      if (!Array.isArray(values) || !values.every(v => typeof v === "string" && field.options.some(o => o.value === v)) || new Set(values).size !== values.length || (field.type !== "checkboxes" && typeof value !== "string")) errors[field.id] = "Choose a valid option";
    } else if ("min" in field) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < field.min || value > field.max || Math.abs((value-field.min)/field.step - Math.round((value-field.min)/field.step)) > 1e-7) errors[field.id] = `Enter a number from ${field.min} to ${field.max} in steps of ${field.step}`;
    } else if (field.type === "consent") {
      if (value !== true) errors[field.id] = "Consent must be checked";
    } else if (field.type === "signature") {
      if (typeof value !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 100_000) errors[field.id] = "Draw a valid signature";
    } else if ("maxLength" in field) {
      if (typeof value !== "string" || value.length > field.maxLength) errors[field.id] = `Enter text up to ${field.maxLength} characters`;
      else if (field.type === "email" && !emailCheck.safeParse(value).success) errors[field.id] = "Enter a valid email address";
      else if (field.type === "url" && !urlCheck.safeParse(value).success) errors[field.id] = "Enter an HTTP or HTTPS URL";
      else if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) errors[field.id] = "Enter a valid date";
    }
    if (!errors[field.id]) answers[field.id] = value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

export function publicDefinition(form: FormDefinition): FormDefinition {
  return { ...form, settings: { ...form.settings, notifications: [] } };
}
export function csvCell(value: string): string {
  const safe = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Human-readable answer text for emails, exports and the admin. */
export function answerText(field: Field, value: Answer | undefined): string {
  if (value === undefined || value === "") return "";
  if (field.type === "signature") return "Signature captured";
  if (field.type === "consent") return value === true ? "Yes" : "No";
  if ("options" in field) {
    const label = (v: string) => field.options.find(o => o.value === v)?.label ?? v;
    return Array.isArray(value) ? value.map(label).join(", ") : label(String(value));
  }
  return Array.isArray(value) ? value.join(", ") : String(value);
}

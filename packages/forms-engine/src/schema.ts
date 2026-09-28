import { z } from "zod";

export const API_VERSION = 1 as const;
export const ENGINE_ID = "forms-engine";
export const idSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).refine(value => !Object.hasOwn(Object.prototype, value), "Reserved identifier");
const text = z.string().max(2000);
export const answerSchema = z.union([z.string().max(100_000), z.number().finite(), z.boolean(), z.array(z.string().max(200)).max(100)]);
export type Answer = z.infer<typeof answerSchema>;
export type Answers = Record<string, Answer>;
export const ruleSchema = z.object({ field: idSchema, operator: z.enum(["equals", "not-equals", "contains", "filled", "empty"]), value: z.string().max(200) }).strict();
const base = {
  id: idSchema, label: z.string().min(1).max(200), description: text,
  required: z.boolean(), width: z.enum(["full", "half"]),
  condition: z.object({ mode: z.enum(["all", "any"]), rules: z.array(ruleSchema).min(1).max(20) }).strict().nullable(),
};
const option = z.object({ label: z.string().min(1).max(200), value: z.string().min(1).max(200) }).strict();
export const fieldSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.enum(["text", "textarea", "email", "tel", "url", "date"]), placeholder: z.string().max(200), maxLength: z.number().int().min(1).max(10_000) }).strict(),
  z.object({ ...base, type: z.enum(["number", "rating", "nps"]), min: z.number().finite(), max: z.number().finite(), step: z.number().positive().finite() }).strict(),
  z.object({ ...base, type: z.enum(["select", "radio", "checkboxes"]), options: z.array(option).min(1).max(100) }).strict(),
  z.object({ ...base, type: z.literal("consent") }).strict(),
  z.object({ ...base, type: z.literal("signature") }).strict(),
  z.object({ ...base, type: z.literal("calculation"), operation: z.enum(["sum", "product", "average"]), fields: z.array(idSchema).min(1).max(30), decimals: z.number().int().min(0).max(6) }).strict(),
  z.object({ ...base, type: z.enum(["section", "page"]) }).strict(),
]);
export type Field = z.infer<typeof fieldSchema>;
export type FieldType = Field["type"];
export const definitionSchema = z.object({
  schemaVersion: z.literal(1), title: z.string().min(1).max(200), description: text,
  fields: z.array(fieldSchema).min(1).max(100),
  settings: z.object({
    submitLabel: z.string().min(1).max(80), confirmation: z.string().min(1).max(2000),
    notifications: z.array(z.email()).max(5),
    opensAt: z.iso.datetime().nullable(), closesAt: z.iso.datetime().nullable(),
    mode: z.enum(["standard", "conversational"]),
  }).strict(),
}).strict().superRefine((form, ctx) => {
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
});
export type FormDefinition = z.infer<typeof definitionSchema>;
export const formRecordSchema = z.object({
  draft: definitionSchema, published: definitionSchema.nullable(), publishedVersion: z.number().int().nonnegative(),
  status: z.enum(["draft", "published", "paused"]), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();
export type FormRecord = z.infer<typeof formRecordSchema>;
export const entrySchema = z.object({
  formId: idSchema, formVersion: z.number().int().positive(), title: z.string(),
  answers: z.record(z.string(), answerSchema), fields: z.array(fieldSchema), createdAt: z.iso.datetime(),
  status: z.enum(["new", "read", "archived"]), starred: z.boolean(), notes: z.string().max(5000),
  receiptHash: z.string(), notification: z.enum(["not-requested", "pending", "sent", "failed"]),
}).strict();
export type Entry = z.infer<typeof entrySchema>;
export const formIdInput = z.object({ id: idSchema }).strict();
export const listInput = z.object({ cursor: z.string().optional() }).strict();
export const createInput = z.object({ definition: definitionSchema }).strict();
export const saveInput = z.object({ id: idSchema, revision: z.string().min(1), definition: definitionSchema }).strict();
export const versionInput = z.object({ id: idSchema, revision: z.string().min(1) }).strict();
export const entriesInput = z.object({ formId: idSchema, cursor: z.string().optional() }).strict();
export const entryUpdateInput = z.object({ id: idSchema, revision: z.string().min(1), status: z.enum(["new", "read", "archived"]), starred: z.boolean(), notes: z.string().max(5000) }).strict();
export const submitInput = z.object({ formId: idSchema, ticket: idSchema, answers: z.record(idSchema, answerSchema), website: z.string().max(1000) }).strict();
export const ticketSchema = z.object({ formId: idSchema, version: z.number().int(), issuedAt: z.number(), expiresAt: z.number() }).strict();

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
      else if (field.type === "email" && !z.email().safeParse(value).success) errors[field.id] = "Enter a valid email address";
      else if (field.type === "url" && !z.url({ protocol: /^https?$/ }).safeParse(value).success) errors[field.id] = "Enter an HTTP or HTTPS URL";
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

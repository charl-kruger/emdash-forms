import type { Field, FormDefinition } from "@emdash-forms/plugin/schema";

export function assertFieldOrder(fields: Field[]): void {
  const seen = new Set<string>();
  for (const field of fields) {
    const dependencies = [...(field.condition?.rules.map(rule => rule.field) ?? []), ...(field.type === "calculation" ? field.fields : [])];
    if (dependencies.some(id => !seen.has(id))) throw new Error(`Keep "${field.label}" after the fields used by its conditions or calculation.`);
    seen.add(field.id);
  }
}
export function moveField(form: FormDefinition, id: string, target: number): FormDefinition {
  const fields = [...form.fields];
  const from = fields.findIndex(field => field.id === id);
  if (from < 0 || target < 0 || target >= fields.length || from === target) return form;
  const [field] = fields.splice(from, 1);
  if (!field) return form;
  fields.splice(target, 0, field);
  assertFieldOrder(fields);
  return { ...form, fields };
}
export function removeField(form: FormDefinition, id: string): FormDefinition {
  if (form.fields.length === 1) throw new Error("Keep at least one field in your form.");
  const dependent = form.fields.find(field => field.condition?.rules.some(rule => rule.field === id) || (field.type === "calculation" && field.fields.includes(id)));
  if (dependent) throw new Error(`"${dependent.label}" uses this field. Update its conditions or calculation before deleting.`);
  return { ...form, fields: form.fields.filter(field => field.id !== id) };
}

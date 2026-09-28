import { describe, expect, it } from "vitest";
import { csvCell, definitionSchema, publicDefinition, validateAnswers } from "../src/schema";
import type { FormDefinition } from "../src/schema";
import { newField, templates } from "../src/templates";
function form(): FormDefinition { const template = templates.find(t => t.id === "contact"); if (!template) throw new Error("Missing template"); return structuredClone(template.definition); }
describe("form rules", () => {
  it("evaluates conditional requirements and rejects hidden answers", () => {
    const value = form();
    value.fields = [{ ...newField("text", "choice"), required: true }, { ...newField("text", "detail"), required: true, condition: { mode: "all", rules: [{ field: "choice", operator: "equals", value: "yes" }] } }];
    expect(validateAnswers(value, { choice: "no" })).toEqual({ ok: true, answers: { choice: "no" } });
    expect(validateAnswers(value, { choice: "yes" })).toMatchObject({ ok: false, errors: { detail: "This field is required" } });
    expect(validateAnswers(value, { choice: "no", detail: "injected" })).toMatchObject({ ok: false });
  });
  it("computes totals server-side and rejects client-supplied totals", () => {
    const value = form();
    value.fields = [newField("number", "quantity"), newField("number", "price"), { id: "total", label: "Total", description: "", required: false, width: "full", condition: null, type: "calculation", operation: "product", fields: ["quantity", "price"], decimals: 2 }];
    expect(validateAnswers(value, { quantity: 3, price: 9 })).toEqual({ ok: true, answers: { quantity: 3, price: 9, total: 27 } });
    expect(validateAnswers(value, { quantity: 3, price: 9, total: 1 })).toMatchObject({ ok: false });
  });
  it("rejects reserved IDs, invalid references, duplicate IDs and fractional rating scales", () => {
    const value = form();
    value.fields = [newField("text", "constructor")];
    expect(definitionSchema.safeParse(value).success).toBe(false);
    value.fields = [newField("text", "same"), newField("text", "same")];
    expect(definitionSchema.safeParse(value).success).toBe(false);
    value.fields = [{ ...newField("text", "first"), condition: { mode: "all", rules: [{ field: "missing", operator: "filled", value: "" }] } }];
    expect(definitionSchema.safeParse(value).success).toBe(false);
    const rating = newField("rating", "rating");
    if (rating.type !== "rating") throw new Error("Wrong field type");
    value.fields = [{ ...rating, min: 1.5 }];
    expect(definitionSchema.safeParse(value).success).toBe(false);
  });
  it("keeps recipients private and escapes spreadsheet formulas", () => {
    const value = form(); value.settings.notifications = ["owner@example.test"];
    expect(publicDefinition(value).settings.notifications).toEqual([]);
    expect(value.settings.notifications).toHaveLength(1);
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
  });
});

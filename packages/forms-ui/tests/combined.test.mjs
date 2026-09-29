import { test } from "node:test";
import assert from "node:assert/strict";
import { forms, createPlugin } from "../dist/index.js";
import { templates, newField } from "../dist/templates.js";
import { moveField, removeField } from "../src/builder-state.ts";

test("one native descriptor and runtime agree on identity and admin exports", () => {
  const descriptor = forms(), plugin = createPlugin();
  assert.equal(descriptor.id, "forms");
  assert.equal(descriptor.format, "native");
  assert.equal(descriptor.id, plugin.id);
  assert.equal(descriptor.adminEntry, plugin.admin.entry);
  assert.equal(descriptor.componentsEntry, "@emdash-forms/plugin/astro");
  assert.deepEqual(descriptor.adminPages, plugin.admin.pages);
  assert.equal(descriptor.portableTextBlocks[0].type, "studio-form");
  assert.deepEqual(Object.keys(plugin.storage).sort(), ["entries", "forms", "tickets"]);
  assert.equal(plugin.routes.admin, undefined, "no competing Block Kit admin registered");
  assert.equal(Object.keys(plugin.mcp.tools).length, 10);
});
test("native adapter preserves private route permissions, methods and body limits", () => {
  const plugin = createPlugin();
  const publicRoutes = Object.entries(plugin.routes).filter(([,route]) => route.public).map(([name]) => name).sort();
  assert.deepEqual(publicRoutes, ["definition", "info", "submit", "ticket"]);
  for (const [name, route] of Object.entries(plugin.routes)) {
    assert.equal(route.permission, "plugins:manage", name);
    assert.deepEqual(route.methods, ["definition", "info"].includes(name) ? ["GET"] : ["POST"]);
    if (route.methods[0] === "POST") assert.equal(route.request.maxBytes, 512000);
  }
  for (const tool of Object.values(plugin.mcp.tools)) assert.ok(plugin.routes[tool.route]);
  assert.ok(plugin.hooks.cron);
});
test("builder reorders without mutating the saved definition", () => {
  const form = structuredClone(templates[0].definition);
  const next = moveField(form, "message", 0);
  assert.equal(next.fields[0].id, "message");
  assert.equal(form.fields[0].id, "name");
  assert.equal(moveField(form, "unknown", 0), form);
});
test("builder blocks reorders and deletion that break conditions", () => {
  const form = structuredClone(templates[0].definition);
  form.fields[2].condition = {mode:"all",rules:[{field:"email",operator:"filled",value:""}]};
  assert.throws(() => moveField(form, "message", 0), /Keep/);
  assert.throws(() => removeField(form, "email"), /uses this field/);
  assert.equal(removeField(form, "message").fields.length, 2);
});
test("builder protects calculation dependencies and the last field", () => {
  const form = structuredClone(templates[3].definition);
  assert.throws(() => removeField(form, "name"), /at least one/);
  form.fields = [newField("number","quantity"), {...newField("calculation","total"),fields:["quantity"]}];
  assert.throws(() => moveField(form, "total", 0), /Keep/);
  assert.throws(() => removeField(form, "quantity"), /uses this field/);
});

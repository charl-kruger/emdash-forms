import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { forms, createPlugin, REGISTRY_ENGINE_ID } from "../dist/index.js";

// Same derivation EmDash uses for registry installs (emdash/src/registry/plugin-id.ts).
async function registryId(did, slug) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${did}\n${slug}`)));
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0, value = 0, out = "";
  for (const byte of hash) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; out += alphabet[(value >>> bits) & 31]; } }
  return `r_${out.slice(0, 16)}`;
}

test("default engine ID matches the published registry plugin", async () => {
  const manifest = await readFile(new URL("../../forms-engine/emdash-plugin.jsonc", import.meta.url), "utf8");
  const did = manifest.match(/"publisher":\s*"([^"]+)"/)[1];
  const slug = manifest.match(/"slug":\s*"([^"]+)"/)[1];
  assert.equal(REGISTRY_ENGINE_ID, await registryId(did, slug));
  assert.equal(forms().options.engineId, REGISTRY_ENGINE_ID);
});

test("add-on only renders: no admin pages, storage or engine routes", () => {
  const descriptor = forms(), plugin = createPlugin();
  assert.equal(descriptor.id, "forms-embed");
  assert.equal(descriptor.format, "native");
  assert.equal(descriptor.componentsEntry, "@netdollar/emdash-forms/astro");
  assert.equal(descriptor.adminEntry, undefined);
  assert.equal(descriptor.adminPages, undefined);
  assert.equal(descriptor.portableTextBlocks[0].type, "studio-form");
  assert.deepEqual(plugin.storage ?? {}, {});
  assert.deepEqual(Object.keys(plugin.routes), ["connection"]);
});

test("connection route points the browser at the configured engine", async () => {
  const route = createPlugin({ engineId: "forms" }).routes.connection;
  assert.equal(route.public, true);
  assert.deepEqual(await route.handler({}), { engineId: "forms", apiVersion: 1 });
  assert.throws(() => forms({ engineId: "../admin" }), /engineId/);
});

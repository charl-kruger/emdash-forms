import { afterEach, describe, expect, it } from "vitest";
import { createPluginTestHost, type PluginTestHost } from "@emdash-cms/plugin-test";
import { z } from "zod";
import { templates } from "../src/templates";
import { formRecordSchema } from "../src/schema";
let host: PluginTestHost | undefined;
afterEach(async () => { await host?.dispose(); host = undefined; });
const formResponse = z.object({ ok: z.literal(true), id: z.string(), revision: z.string(), record: formRecordSchema });
function contact() { const template = templates.find(t => t.id === "contact"); if (!template) throw new Error("Missing contact template"); return structuredClone(template.definition); }

describe("forms across the sandbox boundary", () => {
  it("creates, publishes, protects revisions, validates and stores a single response", async () => {
    host = await createPluginTestHost();
    const created = formResponse.parse(await host.invokeRoute("create", { definition: contact() }));
    expect(await host.invokeRoute("definition", { id: created.id })).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
    const published = formResponse.parse(await host.invokeRoute("publish", { id: created.id, revision: created.revision }));
    expect(await host.invokeRoute("save", { id: created.id, revision: created.revision, definition: contact() })).toMatchObject({ ok: false, code: "CONFLICT" });
    const ticket = z.object({ ok: z.literal(true), ticket: z.string() }).parse(await host.invokeRoute("ticket", { id: created.id }));
    await new Promise(resolve => setTimeout(resolve, 1550));
    const input = { formId: created.id, ticket: ticket.ticket, website: "", answers: { name: "Test visitor", email: "person@example.com", message: "A test response" } };
    expect(await host.invokeRoute("submit", { ...input, answers: { ...input.answers, email: "invalid" } })).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(await host.invokeRoute("submit", input)).toMatchObject({ ok: true, accepted: true, duplicate: false });
    expect(await host.invokeRoute("submit", input)).toMatchObject({ ok: true, accepted: true, duplicate: true });
    expect(await host.invokeRoute("submit", { ...input, answers: { ...input.answers, message: "Changed" } })).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await host.storage("entries").list()).toHaveLength(1);
    await host.invokeRoute("pause", { id: created.id, revision: published.revision });
    expect(await host.invokeRoute("ticket", { id: created.id })).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
  });
  it("rejects unknown fields and renders the registry admin", async () => {
    host = await createPluginTestHost();
    expect(await host.invokeRoute("create", { definition: { ...contact(), unsupported: true } })).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    const page = await host.invokeRoute("admin", { type: "page_load", page: "/" });
    expect(page).toMatchObject({ blocks: [{ type: "header", text: "Forms" }, { type: "empty", title: "Create your first form" }] });
    expect(await host.invokeRoute("admin", { type: "block_action", action_id: "create:contact" })).toMatchObject({ blocks: expect.arrayContaining([{ type: "header", text: "Get in touch" }]) });
    expect(await host.storage("forms").list()).toHaveLength(1);
  });
});

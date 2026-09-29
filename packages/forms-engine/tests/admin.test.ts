import { afterEach, expect, it } from "vitest";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";
import type { BlockResponse } from "@emdash-cms/blocks";
import { z } from "zod";
import { formRecordSchema } from "../src/schema";

let host: PluginRuntimeTestHost | undefined;
afterEach(async () => { await host?.dispose(); host = undefined; });

/** Find the first action_id in a response that starts with a prefix. */
function action(response: BlockResponse, prefix: string): string {
  const found = JSON.stringify(response).match(new RegExp(`"action_id":"(${prefix}[^"]*)"`));
  if (!found?.[1]) throw new Error(`No action starting with ${prefix}`);
  return found[1];
}
const text = (response: BlockResponse) => JSON.stringify(response);

it("builds, publishes and manages a form entirely through the admin screens", async () => {
  host = await createPluginRuntimeTestHost();
  const user = await host.fixtures.user({ email: "admin@example.test", role: "admin" });
  const page = "/forms";
  let formId = "";
  const records = async () => [z.object({ record: formRecordSchema }).passthrough().parse(await host!.transport.invokeRoute("get", { id: formId })).record];

  expect((await host.admin.loadPage(page, { user })).blocks[1]).toMatchObject({ type: "empty" });
  let view = await host.admin.act(page, "create:contact", { user });
  expect(view.blocks[0]).toMatchObject({ type: "header", text: "Get in touch" });
  expect(view.blocks.some(b => b.type === "tab")).toBe(true);
  formId = action(view, "publish:").split(":")[1];
  expect(formId).toMatch(/^get-in-touch-[0-9a-f]{4}$/);

  // Add and configure a dropdown
  view = await host.admin.act(page, action(view, "add-field:"), { user, value: "select" });
  expect(view.blocks[0]).toMatchObject({ type: "header", text: "Edit field: Dropdown" });
  view = await host.admin.submit(page, action(view, "field-save:"), { label: "Topic", description: "", required: true, width: "full", options: "Sales\nSupport", conditional: false }, { user });
  expect(view.toast).toMatchObject({ type: "success", message: "Field saved" });
  expect((await records())[0]?.draft.fields.at(-1)).toMatchObject({ label: "Topic", required: true, options: [{ label: "Sales", value: "sales" }, { label: "Support", value: "support" }] });

  // A calculation without numeric fields explains itself; a page break adds a first question for the new step
  view = await host.admin.act(page, action(view, "add-field:"), { user, value: "calculation" });
  expect(text(view)).toContain("Add a number, rating or NPS field first");
  view = await host.admin.act(page, action(view, "add-field:"), { user, value: "page" });
  expect((await records())[0]?.draft.fields.slice(-2).map(f => f.type)).toEqual(["page", "text"]);

  // Settings validate emails before saving
  view = await host.admin.act(page, `open:${formId}:settings`, { user });
  const settings = { title: "Contact us", description: "", submitLabel: "Send", confirmation: "Thanks!", notifications: "not-an-email", mode: "standard" };
  view = await host.admin.submit(page, action(view, "settings:"), settings, { user });
  expect(view.blocks).toContainEqual(expect.objectContaining({ type: "banner", variant: "error" }));
  view = await host.admin.submit(page, action(view, "settings:"), { ...settings, notifications: "" }, { user });
  expect(view.toast).toMatchObject({ message: "Settings saved" });
  expect(view.blocks[0]).toMatchObject({ type: "header", text: "Contact us" });

  // Publish, then submit a response as a visitor
  view = await host.admin.act(page, action(view, "publish:"), { user });
  expect(view.toast).toMatchObject({ message: "Published" });
  const ticket = z.object({ ticket: z.string() }).passthrough().parse(await host.transport.invokeRoute("ticket", { id: formId }));
  await new Promise(resolve => setTimeout(resolve, 1550));
  expect(await host.transport.invokeRoute("submit", { formId, ticket: ticket.ticket, website: "", answers: { name: "Ada", email: "ada@example.test", message: "Hello", topic: "support", short_text: "More" } })).toMatchObject({ ok: true, accepted: true });

  // Responses list, entry detail (marks as read), CSV export and dashboard widget
  view = await host.admin.act(page, `open:${formId}:responses`, { user });
  expect(text(view)).toContain("Ada · ada@example.test");
  view = await host.admin.act(page, action(view, "entry:"), { user });
  expect(view.blocks[0]).toMatchObject({ type: "header", text: "Response to Contact us" });
  expect(text(view)).toContain('"value":"Support"');
  view = await host.admin.act(page, `export:${formId}`, { user });
  expect(text(view)).toContain("Topic");
  const widget = await host.admin.loadWidget("recent-responses", { user });
  expect(widget.blocks[0]).toMatchObject({ type: "stats", items: [{ label: "Unread", value: 0 }, { label: "All responses", value: 1 }] });

  // Delete asks first, then removes the form and its responses
  view = await host.admin.act(page, `open:${formId}`, { user });
  view = await host.admin.act(page, action(view, "more:"), { user, value: "delete" });
  expect(text(view)).toContain("its 1 response will be permanently deleted");
  view = await host.admin.act(page, action(view, "delete:"), { user });
  expect(view.blocks[1]).toMatchObject({ type: "empty" });
  expect(await host.transport.invokeRoute("entries", { formId })).toMatchObject({ ok: false, code: "NOT_FOUND" });
});

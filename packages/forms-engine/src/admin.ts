import type { RouteEntry } from "emdash/plugin";
import type { Block, BlockResponse } from "@emdash-cms/blocks";
import { z } from "zod";
import { definitionSchema, formRecordSchema, idSchema } from "./schema";
import { templates } from "./templates";

const interaction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page_load"), page: z.string() }),
  z.object({ type: z.literal("block_action"), action_id: z.string(), value: z.unknown().optional() }),
  z.object({ type: z.literal("form_submit"), action_id: z.string(), values: z.record(z.string(), z.unknown()) }),
]);
const resultSchema = z.object({ ok: z.boolean(), message: z.string().optional() }).passthrough();
const formResult = z.object({ id: idSchema, revision: z.string(), record: formRecordSchema });
type Operations = Record<"list" | "create" | "get" | "save" | "publish" | "pause" | "entries", Exclude<RouteEntry, (...args: never[]) => unknown>>;

export function adminRoute(operations: Operations): RouteEntry {
  return { permission: "plugins:manage", handler: async (request, ctx): Promise<BlockResponse> => {
    const input = interaction.parse(request.input);
    const call = async (name: keyof Operations, data: unknown) => {
      const result = resultSchema.parse(await operations[name].handler({ ...request, input: data }, ctx));
      if (!result.ok) throw new Error(result.message === undefined ? "Form operation failed" : result.message);
      return result;
    };
    const home = async (cursor?: string): Promise<BlockResponse> => {
      const page = z.object({ items: z.array(z.object({ id: idSchema, record: formRecordSchema })), cursor: z.string().nullable().optional(), hasMore: z.boolean() }).parse(await call("list", cursor === undefined ? {} : { cursor }));
      const blocks: Block[] = [
        { type: "header", text: "Forms" },
        { type: "context", text: "Create from a template, edit a validated definition, publish, and inspect responses. Forms Studio adds the visual editor and site rendering components." },
        { type: "actions", elements: templates.map(t => ({ type: "button", action_id: `create:${t.id}`, label: `New ${t.title}` })) },
      ];
      for (const row of page.items) blocks.push({ type: "section", text: `${row.record.draft.title} · ${row.record.status}`, accessory: { type: "button", action_id: `open:${row.id}`, label: "Manage" } });
      if (page.hasMore) {
        if (!page.cursor) throw new Error("Missing pagination cursor");
        blocks.push({ type: "actions", elements: [{ type: "button", action_id: "more", label: "Next forms", value: page.cursor }] });
      }
      return { blocks };
    };
    const detail = async (id: string): Promise<BlockResponse> => {
      const form = formResult.parse(await call("get", { id }));
      return { blocks: [
        { type: "header", text: form.record.draft.title },
        { type: "fields", fields: [{ label: "Form ID", value: id }, { label: "Status", value: form.record.status }] },
        { type: "context", text: "Publishing exposes this form through the public API. Add the native Forms Studio companion for a visual editor and website form rendering." },
        { type: "form", block_id: `definition:${id}`, fields: [{ type: "text_input", action_id: "definition", label: "Form definition (JSON)", multiline: true, initial_value: JSON.stringify(form.record.draft, null, 2) }], submit: { action_id: `save:${id}:${form.revision}`, label: "Validate and save draft" } },
        { type: "actions", elements: [
          { type: "button", action_id: `publish:${id}:${form.revision}`, label: "Publish draft", style: "primary", confirm: { title: "Publish this draft?", text: "Visitors can submit responses using this definition.", confirm: "Publish", deny: "Cancel" } },
          { type: "button", action_id: `pause:${id}:${form.revision}`, label: "Pause responses" },
          { type: "button", action_id: `entries:${id}`, label: "Responses" },
          { type: "button", action_id: "home", label: "All forms" },
        ] },
      ] };
    };
    try {
      if (input.type === "page_load") return home();
      const [action, rawId, ...revisionParts] = input.action_id.split(":");
      if (action === "home") return home();
      if (action === "more" && input.type === "block_action") return home(z.string().parse(input.value));
      if (action === "create") {
        const template = templates.find(t => t.id === rawId);
        if (!template) throw new Error("Unknown form template");
        const created = formResult.parse(await call("create", { definition: template.definition }));
        return detail(created.id);
      }
      const id = idSchema.parse(rawId);
      if (action === "open") return detail(id);
      if (action === "save" && input.type === "form_submit") {
        const definition = definitionSchema.parse(JSON.parse(z.string().parse(input.values.definition)));
        await call("save", { id, revision: revisionParts.join(":"), definition });
        return { ...await detail(id), toast: { type: "success", message: "Draft saved" } };
      }
      if (action === "publish" || action === "pause") {
        await call(action, { id, revision: revisionParts.join(":") });
        return detail(id);
      }
      if (action === "entries" && input.type === "block_action") {
        const cursor = input.value === undefined ? undefined : z.string().parse(input.value);
        const page = z.object({ items: z.array(z.object({ id: z.string(), entry: z.object({ createdAt: z.string(), answers: z.record(z.string(), z.unknown()) }) })), cursor: z.string().nullable().optional(), hasMore: z.boolean() }).parse(await call("entries", { formId: id, cursor }));
        const blocks: Block[] = [{ type: "header", text: "Form responses" }];
        for (const row of page.items) blocks.push({ type: "accordion", label: `${row.entry.createdAt} · ${row.id}`, blocks: [{ type: "code", language: "jsonc", code: JSON.stringify(row.entry.answers, null, 2) }] });
        if (!page.items.length) blocks.push({ type: "context", text: "No responses yet." });
        if (page.hasMore) {
          if (!page.cursor) throw new Error("Missing entry pagination cursor");
          blocks.push({ type: "actions", elements: [{ type: "button", action_id: `entries:${id}`, label: "Next responses", value: page.cursor }] });
        }
        blocks.push({ type: "actions", elements: [{ type: "button", action_id: `open:${id}`, label: "Back to form" }] });
        return { blocks };
      }
      throw new Error("Unsupported forms action");
    } catch (error) {
      return { blocks: [{ type: "banner", variant: "error", title: "Operation failed", description: error instanceof Error ? error.message : "Unknown forms error" }, { type: "actions", elements: [{ type: "button", action_id: "home", label: "Return to forms" }] }], toast: { type: "error", message: "No success was confirmed. Review the error before retrying." } };
    }
  } };
}

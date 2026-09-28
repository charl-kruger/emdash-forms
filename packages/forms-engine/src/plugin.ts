import type { PluginContext, RouteEntry, SandboxedPlugin } from "emdash/plugin";
import { z } from "zod";
import { adminRoute } from "./admin";
import {
  API_VERSION, createInput, csvCell, definitionSchema, entriesInput, entrySchema, entryUpdateInput,
  formIdInput, formRecordSchema, idSchema, listInput, publicDefinition, saveInput, submitInput,
  ticketSchema, validateAnswers, versionInput,
} from "./schema";
import type { Entry, FormDefinition, FormRecord } from "./schema";

class DomainError extends Error {
  constructor(readonly code: string, message: string, readonly fields?: Record<string, string>) { super(message); }
}
function route<T extends z.ZodType>(schema: T, handler: (input: z.output<T>, ctx: PluginContext) => Promise<Record<string, unknown>>, isPublic = false, methods: ("GET" | "POST")[] = ["POST"]): Exclude<RouteEntry, (...args: never[]) => unknown> {
  return { public: isPublic, permission: "plugins:manage", methods,
    request: methods[0] === "GET" ? { body: "none" } : { body: "json", maxBytes: 512_000 },
    handler: async (request, ctx) => {
      const parsed = schema.safeParse(request.input);
      if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the request fields", issues: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })) };
      try { return { ok: true, ...(await handler(parsed.data, ctx)) }; }
      catch (error) { if (error instanceof DomainError) return { ok: false, code: error.code, message: error.message, fields: error.fields }; throw error; }
    },
  };
}
async function load(ctx: PluginContext, id: string) {
  const row = await ctx.storage.forms.getVersioned(id);
  if (!row) throw new DomainError("NOT_FOUND", "Form not found");
  return { record: formRecordSchema.parse(row.value), revision: row.revision };
}
async function change(ctx: PluginContext, id: string, revision: string, record: FormRecord) {
  const result = await ctx.storage.forms.compareAndSet(id, revision, record);
  if (!result.applied) throw new DomainError("CONFLICT", "This form changed. Reload it before saving.");
  return { id, revision: result.revision, record };
}
function active(record: FormRecord): FormDefinition {
  if (record.status !== "published" || !record.published) throw new DomainError("NOT_AVAILABLE", "This form is not accepting responses");
  const now = Date.now();
  if (record.published.settings.opensAt && Date.parse(record.published.settings.opensAt) > now) throw new DomainError("NOT_OPEN", "This form is not open yet");
  if (record.published.settings.closesAt && Date.parse(record.published.settings.closesAt) <= now) throw new DomainError("CLOSED", "This form has closed");
  return record.published;
}
async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
function uuid(prefix: string): string { return prefix + crypto.randomUUID().replaceAll("-", ""); }

const routes = {
    info: route(z.object({}).strict(), async (_input, ctx) => ({ apiVersion: API_VERSION, engineId: ctx.plugin.id, version: ctx.plugin.version, emailConfigured: ctx.email !== undefined }), true, ["GET"]),
    list: route(listInput, async (input, ctx) => {
      const page = await ctx.storage.forms.query({ limit: 50, orderBy: { updatedAt: "desc" }, ...input });
      return { ...page, items: page.items.map(row => ({ id: row.id, record: formRecordSchema.parse(row.data) })) };
    }),
    get: route(formIdInput, async ({ id }, ctx) => ({ id, ...await load(ctx, id) })),
    create: route(createInput, async ({ definition }, ctx) => {
      const id = uuid("f"); const now = new Date().toISOString();
      const record: FormRecord = { draft: definition, published: null, publishedVersion: 0, status: "draft", createdAt: now, updatedAt: now };
      const result = await ctx.storage.forms.compareAndSet(id, null, record);
      if (!result.applied) throw new DomainError("CONFLICT", "Form creation conflicted; submit again");
      return { id, revision: result.revision, record };
    }),
    save: route(saveInput, async ({ id, revision, definition }, ctx) => {
      const { record } = await load(ctx, id);
      return change(ctx, id, revision, { ...record, draft: definition, updatedAt: new Date().toISOString() });
    }),
    publish: route(versionInput, async ({ id, revision }, ctx) => {
      const { record } = await load(ctx, id);
      if (record.draft.settings.notifications.length && !ctx.email) throw new DomainError("EMAIL_NOT_CONFIGURED", "Configure an EmDash email transport before publishing notifications");
      definitionSchema.parse(record.draft);
      return change(ctx, id, revision, { ...record, published: record.draft, publishedVersion: record.publishedVersion + 1, status: "published", updatedAt: new Date().toISOString() });
    }),
    pause: route(versionInput, async ({ id, revision }, ctx) => {
      const { record } = await load(ctx, id);
      return change(ctx, id, revision, { ...record, status: "paused", updatedAt: new Date().toISOString() });
    }),
    definition: route(formIdInput, async ({ id }, ctx) => {
      const { record } = await load(ctx, id);
      return { id, version: record.publishedVersion, definition: publicDefinition(active(record)) };
    }, true, ["GET"]),
    ticket: route(formIdInput, async ({ id }, ctx) => {
      const { record } = await load(ctx, id); active(record);
      const ticket = uuid("t"); const issuedAt = Date.now();
      const created = await ctx.storage.tickets.compareAndSet(ticket, null, { formId: id, version: record.publishedVersion, issuedAt, expiresAt: issuedAt + 3_600_000 });
      if (!created.applied) throw new DomainError("CONFLICT", "Could not initialize submission");
      return { ticket, version: record.publishedVersion, minimumWaitMs: 1500 };
    }, true),
    submit: route(submitInput, async (input, ctx) => {
      if (input.website !== "") throw new DomainError("SPAM_REJECTED", "Submission rejected");
      const receiptHash = await digest([input.formId, Object.entries(input.answers).sort(([a],[b]) => a.localeCompare(b))]);
      const existing = await ctx.storage.entries.get(input.ticket);
      if (existing) {
        const entry = entrySchema.parse(existing);
        if (entry.receiptHash !== receiptHash || entry.formId !== input.formId) throw new DomainError("CONFLICT", "This submission token has already been used");
        return { id: input.ticket, accepted: true, duplicate: true, notification: entry.notification };
      }
      const storedTicket = await ctx.storage.tickets.get(input.ticket);
      if (!storedTicket) throw new DomainError("TICKET_INVALID", "Reload the form before submitting");
      const ticket = ticketSchema.parse(storedTicket);
      if (ticket.formId !== input.formId || ticket.expiresAt < Date.now()) throw new DomainError("TICKET_EXPIRED", "Reload the form before submitting");
      if (Date.now() - ticket.issuedAt < 1500) throw new DomainError("TOO_FAST", "Please wait a moment before submitting");
      const { record } = await load(ctx, input.formId); const form = active(record);
      if (ticket.version !== record.publishedVersion) throw new DomainError("FORM_CHANGED", "This form was updated. Reload it before submitting.");
      const checked = validateAnswers(form, input.answers);
      if (!checked.ok) throw new DomainError("VALIDATION_FAILED", "Please check your answers", checked.errors);
      if (form.settings.notifications.length && !ctx.email) throw new DomainError("EMAIL_NOT_CONFIGURED", "Form notifications are not configured; contact the site owner");
      const entry: Entry = { formId: input.formId, formVersion: record.publishedVersion, title: form.title, answers: checked.answers, fields: form.fields, receiptHash, createdAt: new Date().toISOString(), status: "new", starred: false, notes: "", notification: form.settings.notifications.length ? "pending" : "not-requested" };
      const result = await ctx.storage.entries.compareAndSet(input.ticket, null, entry);
      if (!result.applied) throw new DomainError("SUBMISSION_IN_PROGRESS", "This submission is being processed. Retry with the same token.");
      await ctx.storage.tickets.delete(input.ticket);
      if (form.settings.notifications.length) {
        try {
          if (!ctx.email) throw new Error("Email transport disappeared");
          for (const to of form.settings.notifications) await ctx.email.send({ to, subject: `New response: ${form.title}`, text: form.fields.filter(f => entry.answers[f.id] !== undefined).map(f => `${f.label}: ${f.type === "signature" ? "Signature captured (view entry)" : String(entry.answers[f.id])}`).join("\n\n") });
          entry.notification = "sent";
        } catch {
          entry.notification = "failed";
          ctx.log.error("Form entry saved, notification delivery failed", { entryId: input.ticket });
        }
        const updated = await ctx.storage.entries.updateIf(input.ticket, { where: { notification: "pending" }, set: { notification: entry.notification } });
        if (!updated.applied) throw new DomainError("DELIVERY_STATE_CONFLICT", "Entry accepted but notification status could not be recorded");
      }
      return { id: input.ticket, accepted: true, duplicate: false, notification: entry.notification };
    }, true),
    entries: route(entriesInput, async ({ formId, cursor }, ctx) => {
      await load(ctx, formId);
      const page = await ctx.storage.entries.query({ where: { formId }, orderBy: { createdAt: "desc" }, limit: 50, cursor });
      return { ...page, items: page.items.map(row => ({ id: row.id, entry: entrySchema.parse(row.data) })) };
    }),
    entry: route(formIdInput, async ({ id }, ctx) => {
      const row = await ctx.storage.entries.getVersioned(id);
      if (!row) throw new DomainError("NOT_FOUND", "Entry not found");
      return { id, revision: row.revision, entry: entrySchema.parse(row.value) };
    }),
    "entry-update": route(entryUpdateInput, async ({ id, revision, status, starred, notes }, ctx) => {
      const row = await ctx.storage.entries.get(id);
      if (!row) throw new DomainError("NOT_FOUND", "Entry not found");
      const entry = { ...entrySchema.parse(row), status, starred, notes };
      const result = await ctx.storage.entries.compareAndSet(id, revision, entry);
      if (!result.applied) throw new DomainError("CONFLICT", "This entry changed. Reload it before saving.");
      return { id, revision: result.revision, entry };
    }),
    "entry-delete": route(versionInput, async ({ id, revision }, ctx) => {
      const current = await ctx.storage.entries.getVersioned(id);
      if (!current || current.revision !== revision) throw new DomainError("CONFLICT", "Entry changed or no longer exists");
      await ctx.storage.tickets.delete(id);
      const result = await ctx.storage.entries.compareAndDelete(id, revision);
      if (!result.applied) throw new DomainError("CONFLICT", "Entry changed or no longer exists");
      return { deleted: true };
    }),
    export: route(entriesInput, async ({ formId, cursor }, ctx) => {
      const page = await ctx.storage.entries.query({ where: { formId }, orderBy: { createdAt: "desc" }, limit: 100, cursor });
      const rows = page.items.map(row => {
        const entry = entrySchema.parse(row.data);
        return [row.id, entry.createdAt, entry.status, String(entry.formVersion), JSON.stringify(entry.answers)].map(csvCell).join(",");
      });
      return { csv: ["id,createdAt,status,formVersion,answers", ...rows].join("\r\n"), cursor: page.cursor, hasMore: page.hasMore };
    }),
} satisfies Record<string, RouteEntry>;
const plugin: SandboxedPlugin = {
  hooks: {
    "plugin:activate": async (_event, ctx) => {
      if (!ctx.cron) throw new Error("Forms requires EmDash cron scheduling");
      await ctx.cron.schedule("expired-tickets", { schedule: "*/10 * * * *" });
    },
    "plugin:deactivate": async (_event, ctx) => {
      if (!ctx.cron) throw new Error("Forms requires EmDash cron scheduling");
      await ctx.cron.cancel("expired-tickets");
    },
    cron: async (event, ctx) => {
      if (event.name !== "expired-tickets") throw new Error("Unknown forms scheduled task");
      const expired = await ctx.storage.tickets.query({ where: { expiresAt: { lt: Date.now() } }, limit: 500 });
      if (expired.items.length) await ctx.storage.tickets.deleteMany(expired.items.map(row => row.id));
    },
  },
  routes: { ...routes, admin: adminRoute(routes) },
  mcp: { tools: {
    list_forms: { description: "List forms. Follow the returned cursor for additional pages.", route: "list", input: listInput },
    get_form: { description: "Read a form draft, published snapshot and opaque revision.", route: "get", input: formIdInput },
    create_form: { description: "Create a validated form draft. Does not publish it.", route: "create", input: createInput },
    save_form: { description: "Save a form draft using its current revision. Published form stays unchanged.", route: "save", input: saveInput },
    publish_form: { description: "Publish the draft to visitors using its current revision.", route: "publish", input: versionInput, destructive: true },
    pause_form: { description: "Stop accepting responses without deleting forms or entries.", route: "pause", input: versionInput, destructive: true },
    list_entries: { description: "Read private form responses. Contains personal information.", route: "entries", input: entriesInput },
    update_entry: { description: "Change entry status, notes and starred state with revision protection.", route: "entry-update", input: entryUpdateInput },
  } },
};
export default plugin;

import { z } from "zod";
import { API_VERSION } from "@emdash-forms/engine/schema";

const envelope = z.object({ success: z.boolean(), data: z.unknown().optional(), error: z.unknown().optional() });
const failure = z.object({ ok: z.literal(false), code: z.string(), message: z.string(), fields: z.record(z.string(), z.string()).optional(), issues: z.array(z.object({ path: z.string(), message: z.string() })).optional() });
export class FormsError extends Error {
  constructor(message: string, readonly code: string, readonly fields: Record<string,string> = {}) { super(message); }
}
async function body(response: Response): Promise<unknown> {
  if (!response.ok) throw new FormsError(`Request failed (${response.status}). Check your access and the plugin installation.`, "HTTP_ERROR");
  const value = envelope.parse(await response.json());
  if (!value.success) throw new FormsError("The server could not complete this request", "HOST_ERROR");
  return value.data;
}
export async function connect(): Promise<string> {
  const config = z.object({ engineId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/), apiVersion: z.literal(API_VERSION) }).parse(await body(await fetch("/_emdash/api/plugins/forms-studio/connection", { credentials: "same-origin" })));
  const info = await request(config.engineId, "info", {}, z.object({ ok: z.literal(true), apiVersion: z.literal(API_VERSION), engineId: z.literal(config.engineId) }), true);
  if (info.apiVersion !== API_VERSION) throw new FormsError("Incompatible forms engine", "INCOMPATIBLE_ENGINE");
  return config.engineId;
}
export type Operation = "info" | "list" | "get" | "create" | "save" | "publish" | "pause" | "definition" | "ticket" | "submit" | "entries" | "entry" | "entry-update" | "entry-delete" | "export";
export async function request<T>(engine: string, route: Operation, input: Record<string, unknown>, schema: z.ZodType<T>, get = false): Promise<T> {
  const url = new URL(`/_emdash/api/plugins/${encodeURIComponent(engine)}/${route}`, window.location.origin);
  if (get) for (const [key,value] of Object.entries(input)) { if (typeof value !== "string") throw new FormsError("Invalid query value", "INVALID_REQUEST"); url.searchParams.set(key,value); }
  const value = await body(await fetch(url, { method: get ? "GET" : "POST", credentials: "same-origin", headers: { "X-EmDash-Request": "1", ...(!get ? { "Content-Type": "application/json" } : {}) }, ...(!get ? { body: JSON.stringify(input) } : {}) }));
  const error = failure.safeParse(value);
  if (error.success) throw new FormsError(error.data.issues ? error.data.issues.map(i => `${i.path}: ${i.message}`).join("; ") : error.data.message, error.data.code, error.data.fields);
  return schema.parse(value);
}
export function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function download(filename: string, contents: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

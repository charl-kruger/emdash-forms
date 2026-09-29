import { definePlugin } from "emdash";
import type { PluginDefinition, PluginDescriptor, PortableTextBlockConfig } from "emdash";
import engine, { routes as engineRoutes } from "@emdash-forms/engine/runtime";

const VERSION = "0.1.0";
const entrypoint = "@emdash-forms/plugin";
const blocks: PortableTextBlockConfig[] = [{
  // Preserve the stored Portable Text block type from the previous installation.
  type: "studio-form", label: "Form", icon: "form", description: "Embed a published form",
  fields: [{ type: "text_input", action_id: "formId", label: "Form ID", placeholder: "Find the ID under Forms → Settings → Embed" }],
}];
const storage: NonNullable<PluginDefinition["storage"]> = {
  forms: { indexes: ["status", "updatedAt"] },
  entries: { indexes: ["formId", "createdAt", "status", ["formId", "createdAt"], ["formId", "status"]] },
  tickets: { indexes: ["expiresAt"] },
};
const pages = [{ path: "/forms", label: "Forms", icon: "notepad" }];

/** One native plugin: storage, routes, visual admin, MCP and public rendering. */
export function forms(): PluginDescriptor {
  return { id: "forms", version: VERSION, format: "native", entrypoint,
    adminEntry: `${entrypoint}/admin`, componentsEntry: `${entrypoint}/astro`,
    adminPages: pages, portableTextBlocks: blocks, capabilities: ["email:send"] };
}
export function createPlugin() {
  const routes: NonNullable<PluginDefinition["routes"]> = {};
  for (const [name, route] of Object.entries(engineRoutes)) {
    // Native context includes both parsed input and the scoped plugin services.
    const { input: _input, handler, ...config } = route;
    routes[name] = { ...config, handler: async ctx => handler({
      input: ctx.input, request: { url: ctx.request.url, method: ctx.request.method, headers: Object.fromEntries(ctx.request.headers) },
      requestMeta: ctx.requestMeta, user: ctx.user, ui: ctx.ui,
    }, ctx) };
  }
  return definePlugin({ id: "forms", version: VERSION, storage, capabilities: ["email:send"],
    routes, hooks: {
      "plugin:activate": engine.hooks?.["plugin:activate"],
      "plugin:deactivate": engine.hooks?.["plugin:deactivate"],
      cron: engine.hooks?.cron,
    }, mcp: engine.mcp,
    admin: { entry: `${entrypoint}/admin`, pages, portableTextBlocks: blocks },
  });
}

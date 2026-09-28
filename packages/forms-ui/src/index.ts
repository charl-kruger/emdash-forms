import { definePlugin, definePluginRoute } from "emdash";
import type { PluginDescriptor, PortableTextBlockConfig } from "emdash";

export interface FormsStudioOptions { engineId: string }
const VERSION = "0.1.0";
const blocks: PortableTextBlockConfig[] = [{
  type: "studio-form", label: "Forms Studio", icon: "form", description: "Embed a published form",
  fields: [{ type: "text_input", action_id: "formId", label: "Form ID", placeholder: "Copy the form ID from Forms Studio" }],
}];
function options(input: FormsStudioOptions): FormsStudioOptions {
  if (!input || !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/.test(input.engineId)) throw new Error("Forms Studio requires an explicit, valid engineId");
  return { engineId: input.engineId };
}
export function formsStudio(input: FormsStudioOptions): PluginDescriptor<FormsStudioOptions> {
  return { id: "forms-studio", version: VERSION, format: "native", entrypoint: "@emdash-forms/ui", adminEntry: "@emdash-forms/ui/admin", componentsEntry: "@emdash-forms/ui/astro", options: options(input), adminPages: [{ path: "/forms", label: "Forms Studio", icon: "notepad" }], portableTextBlocks: blocks };
}
export function createPlugin(input: FormsStudioOptions) {
  const config = options(input);
  return definePlugin({ id: "forms-studio", version: VERSION,
    admin: { entry: "@emdash-forms/ui/admin", pages: [{ path: "/forms", label: "Forms Studio", icon: "notepad" }], portableTextBlocks: blocks },
    routes: { connection: definePluginRoute({ public: true, methods: ["GET"], request: { body: "none" }, handler: async () => ({ engineId: config.engineId, apiVersion: 1 }) }) },
  });
}

import { definePlugin, definePluginRoute } from "emdash";
import type { PluginDescriptor, PortableTextBlockConfig } from "emdash";

/**
 * Plugin ID EmDash assigns to `@netdollar.dev/forms` when it is installed from
 * the registry: "r_" + base32(SHA-256(publisher DID + "\n" + slug)), truncated.
 */
export const REGISTRY_ENGINE_ID = "r_yi3qllvcosfhr4ld";
export interface FormsOptions {
  /** ID of the installed Forms plugin. Defaults to the registry install. */
  engineId?: string;
}

const ID = "forms-embed";
const VERSION = "0.1.0";
const ENTRYPOINT = "@netdollar/emdash-forms";
const blocks: PortableTextBlockConfig[] = [{
  // Keep the stored block type so existing content keeps rendering.
  type: "studio-form", label: "Form", icon: "form", description: "Embed a published form",
  fields: [{ type: "text_input", action_id: "formId", label: "Form ID", placeholder: "e.g. contact-us-4f2a (Forms › your form › Embed)" }],
}];

function options(input: FormsOptions = {}): Required<FormsOptions> {
  const engineId = input.engineId ?? REGISTRY_ENGINE_ID;
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/.test(engineId)) throw new Error("EmDash Forms: engineId must be the installed Forms plugin ID");
  return { engineId };
}

/** Renders Forms on the site: the Form content block, <Form> component and /forms/<id> pages. */
export function forms(input?: FormsOptions): PluginDescriptor<Required<FormsOptions>> {
  return { id: ID, version: VERSION, format: "native", entrypoint: ENTRYPOINT, componentsEntry: `${ENTRYPOINT}/astro`, options: options(input), portableTextBlocks: blocks };
}

export function createPlugin(input?: FormsOptions) {
  const { engineId } = options(input);
  return definePlugin({ id: ID, version: VERSION,
    admin: { portableTextBlocks: blocks },
    routes: { connection: definePluginRoute({ public: true, methods: ["GET"], request: { body: "none" }, handler: async () => ({ engineId, apiVersion: 1 }) }) },
  });
}

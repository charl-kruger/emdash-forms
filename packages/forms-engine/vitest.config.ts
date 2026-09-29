import { emdashPluginTest } from "@emdash-cms/plugin-test/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [emdashPluginTest()],
	// Sandbox cold starts plus the 1.5 s anti-spam wait exceed Vitest's 5 s default.
	test: { testTimeout: 60_000 },
});

#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, access } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

// A deterministic installer for the supported Astro config shape. Unknown shapes fail.
// Plugin ID of @netdollar.dev/forms when installed from the EmDash registry.
const REGISTRY_ENGINE_ID = "r_yi3qllvcosfhr4ld";
const args = process.argv.slice(2);
const usage = "Usage: emdash-forms [--engine-id <installed-forms-plugin-id>] [--apply]";
const engineFlag = args.indexOf("--engine-id");
const customEngine = engineFlag >= 0 ? args[engineFlag + 1] : undefined;
if (engineFlag >= 0 && (!customEngine || !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/.test(customEngine))) throw new Error(usage);
if (args.some((arg, i) => arg !== "--apply" && arg !== "--engine-id" && i !== engineFlag + 1)) throw new Error(usage);
const engineId = customEngine ?? REGISTRY_ENGINE_ID;
const apply = args.includes("--apply");
const configPath = resolve("astro.config.mjs");
const original = await readFile(configPath, "utf8");
const source = ts.createSourceFile(configPath, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const parse = ts.transpileModule(original, { reportDiagnostics: true, compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022 } });
if (parse.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error("Astro config has syntax errors");
const calls: ts.CallExpression[] = [];
let hasCompanion = false;
let hasLegacyEngine = false;
let serverOutput = false;
function visit(node: ts.Node): void {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && ["@emdash-forms/ui", "@emdash-forms/plugin"].includes(node.moduleSpecifier.text)) hasLegacyEngine = true;
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@netdollar/emdash-forms") hasCompanion = true;
  if (ts.isPropertyAssignment(node) && node.name.getText(source) === "output" && ts.isStringLiteral(node.initializer) && node.initializer.text === "server") serverOutput = true;
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "emdash") calls.push(node);
  ts.forEachChild(node, visit);
}
visit(source);
if (!serverOutput) throw new Error('Expected output: "server" in Astro config');
if (hasCompanion) throw new Error("@netdollar/emdash-forms is already imported. Do not install it twice.");
if (hasLegacyEngine) throw new Error("Remove the older @emdash-forms/ui or @emdash-forms/plugin setup from astro.config.mjs first, then run this installer again.");
if (calls.length !== 1) throw new Error("Expected exactly one emdash({...}) call; custom configs require manual integration");
const call = calls[0];
const config = call?.arguments[0];
if (!config || !ts.isObjectLiteralExpression(config)) throw new Error("Expected an inline EmDash configuration object");
if (config.properties.some(p => ts.isSpreadAssignment(p))) throw new Error("Spread configuration requires manual integration");
const plugins = config.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === "plugins");
if (plugins && (!ts.isPropertyAssignment(plugins) || !ts.isArrayLiteralExpression(plugins.initializer))) throw new Error("Expected a literal plugins array");
if (!config.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(source) === "sandboxRunner")) throw new Error("Configure the EmDash sandbox runner (sandboxRunner) and install Forms from the registry before adding @netdollar/emdash-forms");
const insertion = customEngine ? `forms({ engineId: ${JSON.stringify(customEngine)} })` : "forms()";
let next: string;
if (plugins && ts.isPropertyAssignment(plugins) && ts.isArrayLiteralExpression(plugins.initializer)) {
  const array = plugins.initializer;
  const content = array.elements.map(e => e.getText(source));
  next = original.slice(0,array.getStart(source)) + `[${[...content,insertion].join(", ")}]` + original.slice(array.end);
} else {
  // Keep the existing indentation of the emdash({...}) object.
  const first = config.properties[0];
  const lineStart = (pos: number) => original.lastIndexOf("\n", pos - 1) + 1;
  const indent = first ? original.slice(lineStart(first.getStart(source)), first.getStart(source)) : "\t";
  const closing = original.slice(lineStart(config.end - 1), config.end - 1).match(/^\s*/)?.[0] ?? "";
  const properties = config.properties.map(p => p.getText(source));
  next = original.slice(0,config.getStart(source)) + `{\n${[...properties,`plugins: [${insertion}]`].map(p => indent + p).join(",\n")},\n${closing}}` + original.slice(config.end);
}
next = `import { forms } from "@netdollar/emdash-forms";\n` + next;
const routePath = resolve("src/pages/forms/[id].astro");
try { await access(routePath); throw new Error("A forms route already exists; integrate the exported Form component manually"); }
catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
const route = `---\nimport Form from "@netdollar/emdash-forms/Form";\nconst { id } = Astro.params;\nif (!id || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id)) return new Response("Invalid form ID", { status: 400 });\nAstro.response.headers.set("Cache-Control", "no-store");\n---\n<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Form</title></head><body><main><Form formId={id}/></main></body></html>\n`;
if (!apply) {
  process.stdout.write(JSON.stringify({ status: "planned", engineId, configPath, routePath, nextConfig: next, instructions: "Review this plan, then repeat with --apply. Build and deploy the site after installation." }, null, 2)+"\n");
} else {
  if (await readFile(configPath,"utf8") !== original) throw new Error("Astro config changed while preparing installation");
  const backup = `${configPath}.forms-backup-${Date.now()}`;
  await writeFile(backup,original,{flag:"wx"});
  await mkdir(resolve("src/pages/forms"),{recursive:true});
  await writeFile(routePath,route,{flag:"wx"});
  const temporary = `${configPath}.forms-pending-${Date.now()}`;
  await writeFile(temporary,next,{flag:"wx"});
  await rename(temporary,configPath);
  process.stdout.write(JSON.stringify({status:"configured",engineId,configPath,routePath,backup,buildRequired:true,deployRequired:true},null,2)+"\n");
}

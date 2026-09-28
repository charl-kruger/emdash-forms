#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, access } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
// A deterministic installer for the supported Astro config shape. Unknown shapes fail.
const args = process.argv.slice(2);
const engineFlag = args.indexOf("--engine-id");
if (engineFlag < 0 || !args[engineFlag + 1])
    throw new Error("Usage: emdash-forms --engine-id <installed-engine-id> [--apply]");
const engineId = args[engineFlag + 1];
if (!engineId || !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/.test(engineId))
    throw new Error("Invalid installed engine ID");
const validArgs = new Set(["--engine-id", engineId, "--apply"]);
if (args.some(arg => !validArgs.has(arg)))
    throw new Error("Unknown installer argument");
const apply = args.includes("--apply");
const configPath = resolve("astro.config.mjs");
const original = await readFile(configPath, "utf8");
const source = ts.createSourceFile(configPath, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const parse = ts.transpileModule(original, { reportDiagnostics: true, compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022 } });
if (parse.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error))
    throw new Error("Astro config has syntax errors");
const calls = [];
let hasCompanion = false;
let serverOutput = false;
function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@emdash-forms/ui")
        hasCompanion = true;
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === "output" && ts.isStringLiteral(node.initializer) && node.initializer.text === "server")
        serverOutput = true;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "emdash")
        calls.push(node);
    ts.forEachChild(node, visit);
}
visit(source);
if (!serverOutput)
    throw new Error('Expected output: "server" in Astro config');
if (hasCompanion)
    throw new Error("Forms Studio is already imported. Review its existing engine binding instead of installing twice.");
if (calls.length !== 1)
    throw new Error("Expected exactly one emdash({...}) call; custom configs require manual integration");
const call = calls[0];
const config = call?.arguments[0];
if (!config || !ts.isObjectLiteralExpression(config))
    throw new Error("Expected an inline EmDash configuration object");
if (config.properties.some(p => ts.isSpreadAssignment(p)))
    throw new Error("Spread configuration requires manual integration");
const plugins = config.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === "plugins");
if (plugins && (!ts.isPropertyAssignment(plugins) || !ts.isArrayLiteralExpression(plugins.initializer)))
    throw new Error("Expected a literal plugins array");
const runner = config.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === "sandboxRunner");
if (!runner)
    throw new Error("Configure the EmDash sandbox runner and install the registry engine before adding the companion");
const insertion = `formsStudio({ engineId: ${JSON.stringify(engineId)} })`;
let next;
if (plugins && ts.isPropertyAssignment(plugins) && ts.isArrayLiteralExpression(plugins.initializer)) {
    const array = plugins.initializer;
    const content = array.elements.map(e => e.getText(source));
    next = original.slice(0, array.getStart(source)) + `[${[...content, insertion].join(", ")}]` + original.slice(array.end);
}
else {
    const properties = config.properties.map(p => p.getText(source));
    next = original.slice(0, config.getStart(source)) + `{\n${[...properties, `plugins: [${insertion}]`].join(",\n")}\n}` + original.slice(config.end);
}
next = `import { formsStudio } from "@emdash-forms/ui";\n` + next;
const routePath = resolve("src/pages/forms/[id].astro");
try {
    await access(routePath);
    throw new Error("A forms route already exists; integrate the exported Form component manually");
}
catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        throw error;
}
const route = `---\nimport Form from "@emdash-forms/ui/Form";\nconst { id } = Astro.params;\nif (!id || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id)) return new Response("Invalid form ID", { status: 400 });\nAstro.response.headers.set("Cache-Control", "no-store");\n---\n<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Form</title></head><body><main><Form formId={id}/></main></body></html>\n`;
if (!apply) {
    process.stdout.write(JSON.stringify({ status: "planned", engineId, configPath, routePath, nextConfig: next, instructions: "Review this plan, then repeat with --apply. Build and deploy the site after installation." }, null, 2) + "\n");
}
else {
    if (await readFile(configPath, "utf8") !== original)
        throw new Error("Astro config changed while preparing installation");
    const backup = `${configPath}.forms-backup-${Date.now()}`;
    await writeFile(backup, original, { flag: "wx" });
    await mkdir(resolve("src/pages/forms"), { recursive: true });
    await writeFile(routePath, route, { flag: "wx" });
    const temporary = `${configPath}.forms-pending-${Date.now()}`;
    await writeFile(temporary, next, { flag: "wx" });
    await rename(temporary, configPath);
    process.stdout.write(JSON.stringify({ status: "configured", engineId, configPath, routePath, backup, buildRequired: true, deployRequired: true }, null, 2) + "\n");
}

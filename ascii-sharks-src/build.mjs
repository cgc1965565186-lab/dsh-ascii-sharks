/**
 * Bundles the plain-JS ocean modules into the single Client artifact the
 * Harness module loader expects. Run: node build.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = join(here, "..", "ascii-sharks-plugin");
const out = join(packageDir, "client.js");
const packageName = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).name;

const modules = ["math.js", "species.js", "world.js", "renderer.js", "engine.js", "entry.js"];

const body = modules
    .map((file) => {
        const source = readFileSync(join(here, file), "utf8");
        return source
            .split("\n")
            .filter((line) => !line.startsWith("import "))
            .map((line) => (line.startsWith("export ") ? line.slice("export ".length) : line))
            .join("\n")
            .trim();
    })
    .join("\n\n");

const banner = `/**
 * ascii-sharks for DeepSeek Harness — an ambient ASCII ocean in the frame gutters.
 * Shark, fish and ocean simulation ported from https://github.com/stackedlol/ascii-sharks
 * (TypeScript sources, plain-JS port). Rendering adapted for the Harness shell.
 */`;

const artifact = `${banner}
window.__ModuleLoader__.load({
  id: '${packageName}',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

${body
    .split("\n")
    .map((line) => (line.length > 0 ? `    ${line}` : line))
    .join("\n")}

    return plugin;
  },
});
`;

writeFileSync(out, artifact);
console.log(`wrote ${out} (${artifact.length} bytes)`);

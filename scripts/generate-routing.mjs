#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDomainsManifest, renderRouting, validateDomainsManifest } from "../src/routing.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repositoryRoot, "config", "domains.json");
const outputPath = path.join(repositoryRoot, "skills", "lark", "references", "routing.md");
const manifest = validateDomainsManifest(await readDomainsManifest(manifestPath));

await writeFile(outputPath, renderRouting(manifest));
console.log(`Generated ${path.relative(repositoryRoot, outputPath)} for ${manifest.domains.length} domains.`);

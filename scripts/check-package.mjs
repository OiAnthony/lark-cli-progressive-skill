#!/usr/bin/env node
import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_MARKDOWN_LINK, mirroredPath, verifyMirror } from "../src/upstream.mjs";
import { readOverrides, validateAppliedOverrides, validateOverrideCoverage } from "../src/overrides.mjs";
import { readDomainsManifest, renderRouting, validateDomainsManifest } from "../src/routing.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(repositoryRoot, "skills", "lark");
const mirrorRoot = path.join(skillRoot, "references", "subskills");
const REVIEWED_UNRESOLVED_LINKS = new Map([
  [
    "references/subskills/lark-minutes/references/lark-minutes-speaker-replace.md::../../lark-vc/references/lark-vc-notes.md",
    "upstream removed the linked lark-vc reference without an equivalent guide path",
  ],
  [
    "references/subskills/lark-minutes/references/lark-minutes-summary.md::url",
    "upstream example uses url as a placeholder rather than a bundled file",
  ],
]);
const allowDomainDrift = process.argv.includes("--allow-domain-drift");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await walk(entryPath));
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

const files = await walk(skillRoot);
const skillFiles = files
  .filter((file) => path.basename(file) === "SKILL.md")
  .map((file) => path.relative(skillRoot, file).split(path.sep).join("/"));
assert.deepEqual(skillFiles, ["SKILL.md"], "the package must expose exactly one discoverable SKILL.md");

const lock = JSON.parse(await readFile(path.join(mirrorRoot, "upstream.lock.json"), "utf8"));
await verifyMirror(mirrorRoot, lock);
const manifestPath = path.join(repositoryRoot, "config", "domains.json");
const routingPath = path.join(skillRoot, "references", "routing.md");
const manifest = validateDomainsManifest(await readDomainsManifest(manifestPath), allowDomainDrift ? null : lock.skills);
assert.equal(
  await readFile(routingPath, "utf8"),
  renderRouting(manifest),
  "references/routing.md must be generated from config/domains.json",
);
const overrides = await readOverrides(path.join(repositoryRoot, "config", "upstream-overrides.json"));
validateOverrideCoverage(lock.files.map(({ sourcePath }) => sourcePath), overrides);
await validateAppliedOverrides(
  async (sourcePath) => readFile(path.join(mirrorRoot, mirroredPath(sourcePath)), "utf8"),
  overrides,
);
for (const skill of lock.skills) {
  await access(path.join(mirrorRoot, skill, "GUIDE.md"));
}

let localLinks = 0;
let reviewedUnresolvedLinks = 0;
const reviewedLinkHits = new Map([...REVIEWED_UNRESOLVED_LINKS.keys()].map((key) => [key, 0]));
for (const file of files.filter((candidate) => candidate.endsWith(".md"))) {
  const markdown = await readFile(file, "utf8");
  const relativeFile = path.relative(skillRoot, file).split(path.sep).join("/");
  for (const match of markdown.matchAll(LOCAL_MARKDOWN_LINK)) {
    const reviewReason = REVIEWED_UNRESOLVED_LINKS.get(`${relativeFile}::${match[1]}`);
    if (reviewReason) {
      const destination = path.resolve(path.dirname(file), match[1]);
      try {
        await access(destination);
        throw new Error(`Reviewed unresolved link now resolves; remove its exception: ${relativeFile}::${match[1]}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const reviewKey = `${relativeFile}::${match[1]}`;
      reviewedLinkHits.set(reviewKey, reviewedLinkHits.get(reviewKey) + 1);
      reviewedUnresolvedLinks += 1;
      continue;
    }

    const destination = path.resolve(path.dirname(file), match[1]);
    try {
      await access(destination);
    } catch {
      throw new Error(`Broken local Markdown link in ${relativeFile}: ${match[0]} → ${destination}`);
    }
    localLinks += 1;
  }
}

for (const [reviewKey, hits] of reviewedLinkHits) {
  assert.equal(hits, 1, `Reviewed unresolved link must match exactly once: ${reviewKey}`);
}

console.log(`Validated one umbrella skill, ${lock.skills.length} routed guides, ${localLinks} local Markdown links, and ${reviewedUnresolvedLinks} reviewed upstream links.`);

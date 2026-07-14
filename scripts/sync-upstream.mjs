#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncUpstreamMirror } from "../src/upstream.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(repositoryRoot, "skills", "lark", "references", "subskills");

const result = await syncUpstreamMirror({ destination });

if (result.status === "unchanged") {
  console.log(`Upstream skills tree unchanged at ${result.source.skillsTree}; skipped mirror.`);
} else if (result.status === "migrated") {
  console.log(`Recorded upstream skills tree ${result.source.skillsTree} without downloading guides.`);
} else {
  console.log(`Mirrored ${result.lock.skills.length} upstream skills at ${result.source.commit} (skills tree ${result.source.skillsTree}).`);
}

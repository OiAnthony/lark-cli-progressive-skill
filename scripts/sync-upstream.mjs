#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readOverrides } from "../src/overrides.mjs";
import { syncUpstreamMirror } from "../src/upstream.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(repositoryRoot, "skills", "lark", "references", "subskills");
const previousLockPath = path.join(destination, "upstream.lock.json");
let previousLock = null;
try {
  previousLock = JSON.parse(await readFile(previousLockPath, "utf8"));
} catch {
  // A missing or invalid lock is a cache miss and will be rebuilt.
}
const overrides = await readOverrides(path.join(repositoryRoot, "config", "upstream-overrides.json"));
const result = await syncUpstreamMirror({ destination, overrides });
const currentLock = result.lock ?? JSON.parse(await readFile(previousLockPath, "utf8"));

if (result.status === "unchanged") {
  console.log(`Upstream skills tree unchanged at ${result.source.skillsTree}; verified and skipped mirror.`);
} else {
  console.log(`Mirrored ${currentLock.skills.length} upstream skills at ${result.source.commit} (skills tree ${result.source.skillsTree}).`);
}

if (process.env.GITHUB_OUTPUT) {
  const previousSkills = new Set(previousLock?.skills ?? []);
  const currentSkills = new Set(currentLock.skills);
  const addedDomains = [...currentSkills].filter((name) => !previousSkills.has(name)).sort();
  const removedDomains = [...previousSkills].filter((name) => !currentSkills.has(name)).sort();
  const values = {
    status: result.status,
    previous_commit: previousLock?.upstream?.commit ?? "none",
    current_commit: currentLock.upstream.commit,
    previous_tree: previousLock?.upstream?.skillsTree ?? "none",
    current_tree: currentLock.upstream.skillsTree,
    added_domains: addedDomains.join(", ") || "none",
    removed_domains: removedDomains.join(", ") || "none",
    domain_count: String(currentLock.skills.length),
    file_count: String(currentLock.files.length),
    overlay_count: String(overrides.overrides.length),
    bundle_sha256: currentLock.bundleSha256,
  };
  const output = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
  await appendFile(process.env.GITHUB_OUTPUT, `${output}\n`);
}

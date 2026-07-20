import { readFile } from "node:fs/promises";

export async function readOverrides(overridesPath) {
  return JSON.parse(await readFile(overridesPath, "utf8"));
}

export function validateOverrides(config) {
  if (config?.schemaVersion !== 1 || !Array.isArray(config.overrides)) {
    throw new Error("Expected upstream overrides schema version 1");
  }

  const paths = new Set();
  for (const override of config.overrides) {
    for (const field of ["sourcePath", "firstSeenCommit", "reason", "match", "replacement"]) {
      if (typeof override?.[field] !== "string" || override[field].length === 0) {
        throw new Error(`Invalid override ${field}: ${JSON.stringify(override)}`);
      }
    }
    if (!override.sourcePath.startsWith("skills/") || !override.sourcePath.endsWith(".md")) {
      throw new Error(`Invalid override source path: ${override.sourcePath}`);
    }
    if (paths.has(override.sourcePath)) {
      throw new Error(`Only one consolidated override is allowed per source path: ${override.sourcePath}`);
    }
    paths.add(override.sourcePath);
  }

  return config;
}

function occurrenceCount(content, match) {
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = content.indexOf(match, cursor);
    if (index === -1) return count;
    count += 1;
    cursor = index + match.length;
  }
}

export function applyOverrides(content, sourcePath, config) {
  validateOverrides(config);
  let output = content;
  const applied = [];

  for (const override of config.overrides.filter((entry) => entry.sourcePath === sourcePath)) {
    const count = occurrenceCount(output, override.match);
    if (count !== 1) {
      throw new Error(`Expected override for ${sourcePath} to match exactly once, found ${count}: ${override.reason}`);
    }
    output = output.replace(override.match, override.replacement);
    applied.push(sourcePath);
  }

  return { content: output, applied };
}

export async function validateAppliedOverrides(readOutput, config) {
  validateOverrides(config);
  for (const override of config.overrides) {
    const output = await readOutput(override.sourcePath);
    const originalCount = occurrenceCount(output, override.match);
    const replacementCount = occurrenceCount(output, override.replacement);
    if (originalCount !== 0 || replacementCount !== 1) {
      throw new Error(`Generated override for ${override.sourcePath} is inconsistent; original matches: ${originalCount}, replacement matches: ${replacementCount}`);
    }
  }
}

export function validateOverrideCoverage(sourcePaths, config) {
  validateOverrides(config);
  const available = new Set(sourcePaths);
  for (const override of config.overrides) {
    if (!available.has(override.sourcePath)) {
      throw new Error(`Override target is absent from upstream: ${override.sourcePath}`);
    }
  }
}

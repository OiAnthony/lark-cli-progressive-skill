#!/usr/bin/env node
import process from "node:process";
import { inspectLegacyInstallation, removeLegacyInstallation } from "./migration.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const targetIndex = args.indexOf("--target");
const target = targetIndex === -1 ? process.cwd() : args[targetIndex + 1];

if (targetIndex !== -1 && !target) {
  throw new Error("--target requires a project directory");
}

const inspection = apply
  ? await removeLegacyInstallation(target)
  : await inspectLegacyInstallation(target);
const items = [...new Set([...inspection.confirmedDirectories, ...inspection.lockEntries])];

if (items.length === 0) {
  console.log("No legacy skills from larksuite/cli found.");
} else if (apply) {
  console.log(`Removed official larksuite/cli skills: ${items.join(", ")}`);
} else {
  console.log(`Would remove official larksuite/cli skills: ${items.join(", ")}`);
  console.log("Re-run with --apply after installing this umbrella skill.");
}

if (inspection.untrackedDirectories.length > 0) {
  console.log(`Not removing untracked lark-* directories: ${inspection.untrackedDirectories.join(", ")}`);
}

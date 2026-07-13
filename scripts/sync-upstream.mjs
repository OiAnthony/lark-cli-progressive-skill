#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchUpstreamSkillFiles, writeMirror } from "../src/upstream.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(repositoryRoot, "skills", "lark", "references", "subskills");

const { files, source } = await fetchUpstreamSkillFiles({});
const lock = await writeMirror({ destination, files, source });

console.log(`Mirrored ${lock.skills.length} upstream skills at ${source.commit}.`);

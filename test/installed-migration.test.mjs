import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const script = path.resolve("skills/lark/scripts/migrate-legacy-skills.mjs");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

test("bundled migration command preserves untracked lark-* directories", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "installed-lark-migration-"));
  const skillsDirectory = path.join(projectRoot, ".agents", "skills");
  await mkdir(path.join(skillsDirectory, "lark-doc"), { recursive: true });
  await mkdir(path.join(skillsDirectory, "lark-local"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".agents", ".skill-lock.json"),
    `${JSON.stringify({
      skills: {
        "lark-doc": { source: "larksuite/cli" },
        "lark-local": { source: "personal/lark-local" },
      },
    })}\n`,
  );

  const { stdout } = await execFile(process.execPath, [script, "--target", projectRoot, "--apply"]);

  assert.match(stdout, /Removed official larksuite\/cli skills: lark-doc/);
  assert.match(stdout, /Not removing untracked lark-\* directories: lark-local/);
  assert.equal(await exists(path.join(skillsDirectory, "lark-doc")), false);
  assert.equal(await exists(path.join(skillsDirectory, "lark-local")), true);
  const lock = JSON.parse(await readFile(path.join(projectRoot, ".agents", ".skill-lock.json"), "utf8"));
  assert.equal("lark-doc" in lock.skills, false);
  assert.equal("lark-local" in lock.skills, true);
});

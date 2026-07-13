import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectLegacyInstallation, removeLegacyInstallation } from "../skills/lark/scripts/migration.mjs";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

test("removes only larksuite/cli skills confirmed by the lockfile", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "lark-migration-"));
  const skillsDirectory = path.join(projectRoot, ".agents", "skills");
  await mkdir(path.join(skillsDirectory, "lark-im"), { recursive: true });
  await mkdir(path.join(skillsDirectory, "lark-custom"), { recursive: true });
  await mkdir(path.join(skillsDirectory, "lark-evil"), { recursive: true });
  await mkdir(path.join(skillsDirectory, "calendar-helper"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "skills-lock.json"),
    `${JSON.stringify({
      version: 1,
      skills: {
        "lark-im": { source: "larksuite/cli", sourceType: "github", skillPath: "skills/lark-im/SKILL.md" },
        "lark-custom": { source: "example/lark-custom", sourceType: "github" },
        "lark-evil": { source: "example/lark-evil", sourceUrl: "https://evil.example/github.com/larksuite/cli" },
      },
    }, null, 2)}\n`,
  );

  const preview = await inspectLegacyInstallation(projectRoot);
  assert.deepEqual(preview.confirmedDirectories, ["lark-im"]);
  assert.deepEqual(preview.untrackedDirectories, ["lark-custom", "lark-evil"]);
  assert.deepEqual(preview.lockEntries, ["lark-im"]);

  await removeLegacyInstallation(projectRoot);

  assert.equal(await exists(path.join(skillsDirectory, "lark-im")), false);
  assert.equal(await exists(path.join(skillsDirectory, "lark-custom")), true);
  assert.equal(await exists(path.join(skillsDirectory, "lark-evil")), true);
  assert.equal(await exists(path.join(skillsDirectory, "calendar-helper")), true);

  const lock = JSON.parse(await readFile(path.join(projectRoot, "skills-lock.json"), "utf8"));
  assert.equal("lark-im" in lock.skills, false);
  assert.equal("lark-custom" in lock.skills, true);
  assert.equal("lark-evil" in lock.skills, true);
});

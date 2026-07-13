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

test("removes only exact official well-known skills", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "lark-well-known-migration-"));
  const skillsDirectory = path.join(projectRoot, ".agents", "skills");
  const names = ["lark-doc", "lark-evil", "lark-http", "lark-wrong-path", "lark-mismatch"];
  await Promise.all(names.map((name) => mkdir(path.join(skillsDirectory, name), { recursive: true })));
  await writeFile(
    path.join(projectRoot, "skills-lock.json"),
    `${JSON.stringify({
      version: 3,
      skills: {
        "lark-doc": {
          source: "open.feishu.cn",
          sourceType: "well-known",
          sourceUrl: "https://open.feishu.cn/.well-known/skills/lark-doc/SKILL.md",
        },
        "lark-evil": {
          source: "open.feishu.cn",
          sourceType: "well-known",
          sourceUrl: "https://evil.example/.well-known/skills/lark-evil/SKILL.md",
        },
        "lark-http": {
          source: "open.feishu.cn",
          sourceType: "well-known",
          sourceUrl: "http://open.feishu.cn/.well-known/skills/lark-http/SKILL.md",
        },
        "lark-wrong-path": {
          source: "open.feishu.cn",
          sourceType: "well-known",
          sourceUrl: "https://open.feishu.cn/skills/lark-wrong-path/SKILL.md",
        },
        "lark-mismatch": {
          source: "open.feishu.cn",
          sourceType: "well-known",
          sourceUrl: "https://open.feishu.cn/.well-known/skills/lark-doc/SKILL.md",
        },
      },
    }, null, 2)}\n`,
  );

  const preview = await inspectLegacyInstallation(projectRoot);
  assert.deepEqual(preview.confirmedDirectories, ["lark-doc"]);
  assert.deepEqual(preview.untrackedDirectories, ["lark-evil", "lark-http", "lark-mismatch", "lark-wrong-path"]);

  await removeLegacyInstallation(projectRoot);

  assert.equal(await exists(path.join(skillsDirectory, "lark-doc")), false);
  for (const name of names.filter((name) => name !== "lark-doc")) {
    assert.equal(await exists(path.join(skillsDirectory, name)), true);
  }

  const lock = JSON.parse(await readFile(path.join(projectRoot, "skills-lock.json"), "utf8"));
  assert.equal("lark-doc" in lock.skills, false);
  assert.equal("lark-evil" in lock.skills, true);
});

import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
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

async function entryExists(file) {
  try {
    await lstat(file);
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
    path.join(projectRoot, "skills-lock.json"),
    `${JSON.stringify({
      skills: {
        "lark-doc": {
          source: "open.feishu.cn",
          sourceType: "well-known",
          sourceUrl: "https://open.feishu.cn/.well-known/skills/lark-doc/SKILL.md",
        },
        "lark-local": { source: "personal/lark-local" },
      },
    })}\n`,
  );

  const { stdout } = await execFile(process.execPath, [script, "--target", projectRoot, "--apply"]);

  assert.match(stdout, /Removed official Lark skills: lark-doc/);
  assert.match(stdout, /Not removing untracked lark-\* directories: lark-local/);
  assert.equal(await exists(path.join(skillsDirectory, "lark-doc")), false);
  assert.equal(await exists(path.join(skillsDirectory, "lark-local")), true);
  const lock = JSON.parse(await readFile(path.join(projectRoot, "skills-lock.json"), "utf8"));
  assert.equal("lark-doc" in lock.skills, false);
  assert.equal("lark-local" in lock.skills, true);
});

test("bundled migration command removes global legacy skills", async () => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "installed-lark-global-migration-"));
  const agentRoot = path.join(homeDirectory, ".agents");
  const skillsDirectory = path.join(agentRoot, "skills");
  const canonicalSkillsDirectory = path.join(homeDirectory, "shared-skills");
  const linkedSkillsDirectory = path.join(homeDirectory, ".claude", "skills");
  await mkdir(path.join(canonicalSkillsDirectory, "lark-doc"), { recursive: true });
  await mkdir(path.join(canonicalSkillsDirectory, "lark-local"), { recursive: true });
  await mkdir(agentRoot, { recursive: true });
  await mkdir(linkedSkillsDirectory, { recursive: true });
  await symlink(canonicalSkillsDirectory, skillsDirectory);
  await symlink(path.join(skillsDirectory, "lark-doc"), path.join(linkedSkillsDirectory, "lark-doc"));
  await symlink(path.join(skillsDirectory, "lark-local"), path.join(linkedSkillsDirectory, "lark-local"));
  await writeFile(
    path.join(agentRoot, ".skill-lock.json"),
    `${JSON.stringify({
      skills: {
        "lark-doc": {
          source: "open.feishu.cn",
          sourceType: "well-known",
          sourceUrl: "https://open.feishu.cn/.well-known/skills/lark-doc/SKILL.md",
        },
        "lark-local": { source: "personal/lark-local" },
      },
    })}\n`,
  );

  const { stdout: previewStdout } = await execFile(process.execPath, [script, "--global"], {
    env: { ...process.env, HOME: homeDirectory },
  });
  assert.match(previewStdout, /Would remove official Lark skills: lark-doc/);
  assert.equal(await exists(path.join(skillsDirectory, "lark-doc")), true);
  const previewLock = JSON.parse(await readFile(path.join(agentRoot, ".skill-lock.json"), "utf8"));
  assert.equal("lark-doc" in previewLock.skills, true);

  const { stdout } = await execFile(process.execPath, [script, "--global", "--apply"], {
    env: { ...process.env, HOME: homeDirectory },
  });

  assert.match(stdout, /Removed official Lark skills: lark-doc/);
  assert.match(stdout, /Not removing untracked lark-\* directories: lark-local/);
  assert.equal(await exists(path.join(skillsDirectory, "lark-doc")), false);
  assert.equal(await exists(path.join(skillsDirectory, "lark-local")), true);
  assert.equal(await entryExists(path.join(linkedSkillsDirectory, "lark-doc")), false);
  assert.equal(await exists(path.join(linkedSkillsDirectory, "lark-local")), true);
  const lock = JSON.parse(await readFile(path.join(agentRoot, ".skill-lock.json"), "utf8"));
  assert.equal("lark-doc" in lock.skills, false);
  assert.equal("lark-local" in lock.skills, true);
});

test("bundled migration command reads the XDG global registry", async () => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "installed-lark-xdg-home-"));
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "installed-lark-xdg-state-"));
  const skillsDirectory = path.join(homeDirectory, ".agents", "skills");
  const lockPath = path.join(stateDirectory, "skills", ".skill-lock.json");
  await mkdir(path.join(skillsDirectory, "lark-doc"), { recursive: true });
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(
    lockPath,
    `${JSON.stringify({ skills: { "lark-doc": { source: "larksuite/cli" } } })}\n`,
  );

  await execFile(process.execPath, [script, "--global", "--apply"], {
    env: { ...process.env, HOME: homeDirectory, XDG_STATE_HOME: stateDirectory },
  });

  assert.equal(await exists(path.join(skillsDirectory, "lark-doc")), false);
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal("lark-doc" in lock.skills, false);
});

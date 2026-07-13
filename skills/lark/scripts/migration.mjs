import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const LEGACY_PREFIX = "lark-";

function isOfficialLarkSkill(lockEntry) {
  if (lockEntry?.source === "larksuite/cli") {
    return true;
  }

  try {
    const sourceUrl = new URL(lockEntry?.sourceUrl);
    return sourceUrl.hostname === "github.com"
      && sourceUrl.pathname.replace(/\.git$/, "") === "/larksuite/cli";
  } catch {
    return false;
  }
}

export async function inspectLegacyInstallation(projectRoot) {
  const agentRoot = path.join(path.resolve(projectRoot), ".agents");
  const skillsDirectory = path.join(agentRoot, "skills");
  const lockPath = path.join(agentRoot, ".skill-lock.json");
  let directories = [];
  let lock = null;

  try {
    directories = (await readdir(skillsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(LEGACY_PREFIX))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    lock = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Cannot parse ${lockPath}: ${error.message}`);
  }

  const lockEntries = Object.entries(lock?.skills ?? {})
    .filter(([name, entry]) => name.startsWith(LEGACY_PREFIX) && isOfficialLarkSkill(entry))
    .map(([name]) => name)
    .sort();
  const confirmedDirectories = directories.filter((name) => lockEntries.includes(name));
  const untrackedDirectories = directories.filter((name) => !lockEntries.includes(name));

  return {
    agentRoot,
    skillsDirectory,
    lockPath,
    lock,
    lockEntries,
    confirmedDirectories,
    untrackedDirectories,
  };
}

export async function removeLegacyInstallation(projectRoot) {
  const inspection = await inspectLegacyInstallation(projectRoot);
  await Promise.all(
    inspection.confirmedDirectories.map((name) => rm(path.join(inspection.skillsDirectory, name), { recursive: true, force: true })),
  );

  if (inspection.lockEntries.length > 0) {
    for (const name of inspection.lockEntries) delete inspection.lock.skills[name];
    const temporaryPath = `${inspection.lockPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(inspection.lock, null, 2)}\n`);
    await rename(temporaryPath, inspection.lockPath);
  }

  return inspection;
}

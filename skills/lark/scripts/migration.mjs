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

async function readLockfile(lockPath) {
  try {
    return { path: lockPath, lock: JSON.parse(await readFile(lockPath, "utf8")) };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Cannot parse ${lockPath}: ${error.message}`);
  }
}

function officialEntries(lock) {
  return Object.entries(lock?.skills ?? {})
    .filter(([name, entry]) => name.startsWith(LEGACY_PREFIX) && isOfficialLarkSkill(entry))
    .map(([name]) => name)
    .sort();
}

export async function inspectLegacyInstallation(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const agentRoot = path.join(resolvedProjectRoot, ".agents");
  const skillsDirectory = path.join(agentRoot, "skills");
  let directories = [];

  try {
    directories = (await readdir(skillsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(LEGACY_PREFIX))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const registries = (await Promise.all([
    readLockfile(path.join(resolvedProjectRoot, "skills-lock.json")),
    readLockfile(path.join(agentRoot, ".skill-lock.json")),
  ])).filter(Boolean).map(({ path: lockPath, lock }) => ({
    path: lockPath,
    lock,
    officialEntries: officialEntries(lock),
  }));
  const lockEntries = [...new Set(registries.flatMap((registry) => registry.officialEntries))].sort();
  const confirmedDirectories = directories.filter((name) => lockEntries.includes(name));
  const untrackedDirectories = directories.filter((name) => !lockEntries.includes(name));

  return {
    agentRoot,
    skillsDirectory,
    registries,
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

  await Promise.all(inspection.registries.map(async (registry) => {
    if (registry.officialEntries.length === 0) return;
    for (const name of registry.officialEntries) delete registry.lock.skills[name];
    const temporaryPath = `${registry.path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(registry.lock, null, 2)}\n`);
    await rename(temporaryPath, registry.path);
  }));

  return inspection;
}

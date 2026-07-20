import { createHash } from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyOverrides, validateOverrideCoverage, validateOverrides } from "./overrides.mjs";

export const UPSTREAM = Object.freeze({
  owner: "larksuite",
  repo: "cli",
  ref: "main",
});

export const LOCAL_MARKDOWN_LINK = /(?<!!)\[[^\]]*\]\((?![a-z][a-z0-9+.-]*:|\/\/|#|\$|\{)([^)\s#]+)(#[^)\s]+)?\)/gi;

const REVIEWED_GUIDE_REDIRECTS = new Map([
  ["skills/lark-event/references/lark-event-subscribe.md", "skills/lark-event/SKILL.md"],
]);

const defaultFileSystem = { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile };

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function compareStrings(left, right) {
  return left.localeCompare(right);
}

function sourceParts(sourcePath) {
  if (typeof sourcePath !== "string" || sourcePath.includes("\\") || path.posix.normalize(sourcePath) !== sourcePath) {
    throw new Error(`Expected a normalized POSIX source path, received: ${sourcePath}`);
  }
  const parts = sourcePath.split("/");
  if (parts.length < 3 || parts[0] !== "skills" || !parts[1] || parts.some((part) => part === "." || part === ".." || part.length === 0)) {
    throw new Error(`Expected a file below skills/<skill>/, received: ${sourcePath}`);
  }

  return parts;
}

function safeTargetPath(targetPath) {
  if (
    typeof targetPath !== "string"
    || targetPath.includes("\\")
    || path.posix.isAbsolute(targetPath)
    || path.posix.normalize(targetPath) !== targetPath
    || targetPath.split("/").some((part) => part === "." || part === ".." || part.length === 0)
  ) {
    throw new Error(`Expected a normalized relative target path, received: ${targetPath}`);
  }
  return targetPath;
}

function resolveInside(root, targetPath) {
  const normalized = safeTargetPath(targetPath);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...normalized.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Target path escapes mirror root: ${targetPath}`);
  }
  return resolved;
}

export function mirroredPath(sourcePath) {
  const [, skill, ...relative] = sourceParts(sourcePath);
  const filename = relative.at(-1);
  const renamed = filename === "SKILL.md" ? "GUIDE.md" : filename;
  return path.join(skill, ...relative.slice(0, -1), renamed);
}

function relativeMirroredTarget(sourcePath, destinationSourcePath) {
  const sourceTarget = mirroredPath(sourcePath).split(path.sep).join("/");
  const destinationTarget = mirroredPath(destinationSourcePath).split(path.sep).join("/");
  return path.posix.relative(path.posix.dirname(sourceTarget), destinationTarget);
}

export function rewriteLocalSkillLinks(markdown, { sourcePath, sourcePaths = new Set(), source } = {}) {
  return markdown.replace(LOCAL_MARKDOWN_LINK, (match, target) => {
    const linkedSourcePath = sourcePath
      ? path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), target))
      : null;
    const isRepositoryRelative = linkedSourcePath
      && linkedSourcePath !== ".."
      && !linkedSourcePath.startsWith("../")
      && !linkedSourcePath.startsWith("/");

    if (!target.endsWith("SKILL.md")) {
      const owningSkill = sourcePath ? sourceParts(sourcePath)[1] : null;
      const redirectedSourcePath = REVIEWED_GUIDE_REDIRECTS.get(linkedSourcePath);
      if (sourcePath && redirectedSourcePath && sourcePaths.has(redirectedSourcePath)) {
        return match.replace(`](${target}`, `](${relativeMirroredTarget(sourcePath, redirectedSourcePath)}`);
      }
      const sameDomainCandidates = linkedSourcePath && owningSkill
        ? [...sourcePaths].filter((candidate) => candidate.startsWith(`skills/${owningSkill}/`)
          && path.posix.basename(candidate) === path.posix.basename(linkedSourcePath))
        : [];
      if (sourcePath && sameDomainCandidates.length === 1) {
        return match.replace(`](${target}`, `](${relativeMirroredTarget(sourcePath, sameDomainCandidates[0])}`);
      }
      if (source && isRepositoryRelative && !sourcePaths.has(linkedSourcePath) && !linkedSourcePath.startsWith("skills/")) {
        return match.replace(`](${target}`, `](https://github.com/${source.owner}/${source.repo}/blob/${source.commit}/${linkedSourcePath}`);
      }
      return match;
    }

    const renamedTarget = `${target.slice(0, -"SKILL.md".length)}GUIDE.md`;
    if (!sourcePath || sourcePaths.has(linkedSourcePath)) {
      return match.replace(`](${target}`, `](${renamedTarget}`);
    }

    const skillName = target.match(/(?:^|\/)(lark-[^/]+)\/SKILL\.md$/)?.[1];
    const canonicalSourcePath = skillName ? `skills/${skillName}/SKILL.md` : null;
    if (!canonicalSourcePath || !sourcePaths.has(canonicalSourcePath)) {
      return match.replace(`](${target}`, `](${renamedTarget}`);
    }

    return match.replace(`](${target}`, `](${relativeMirroredTarget(sourcePath, canonicalSourcePath)}`);
  });
}

export function normalizeSkillFiles(files) {
  const skills = new Map();

  for (const file of files) {
    const parts = sourceParts(file.path);
    const skill = parts[1];
    const entries = skills.get(skill) ?? [];
    entries.push(file);
    skills.set(skill, entries);
  }

  for (const [skill, entries] of skills) {
    if (!entries.some(({ path: sourcePath }) => sourcePath === `skills/${skill}/SKILL.md`)) {
      throw new Error(`Upstream skill ${skill} does not contain SKILL.md`);
    }
  }

  return skills;
}

function bundleDigest(entries) {
  const manifest = entries
    .map(({ sourcePath, targetPath, sourceSha256, outputSha256 }) => ({ sourcePath, targetPath, sourceSha256, outputSha256 }))
    .sort((left, right) => compareStrings(left.targetPath, right.targetPath));
  return sha256(JSON.stringify(manifest));
}

function overridesDigest(overrides) {
  return sha256(JSON.stringify(overrides));
}

async function walk(directory, fileSystem = defaultFileSystem) {
  const entries = await fileSystem.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(entryPath, fileSystem));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

export async function verifyMirror(destination, lock = null, fileSystem = defaultFileSystem) {
  const resolvedLock = lock ?? JSON.parse(await fileSystem.readFile(path.join(destination, "upstream.lock.json"), "utf8"));
  if (resolvedLock?.schemaVersion !== 3 || !Array.isArray(resolvedLock.files) || !Array.isArray(resolvedLock.skills)) {
    throw new Error("Expected upstream lock schema version 3");
  }

  const actualSkills = [...normalizeSkillFiles(resolvedLock.files.map(({ sourcePath }) => ({ path: sourcePath }))).keys()].sort(compareStrings);
  const lockedSkills = [...resolvedLock.skills].sort(compareStrings);
  if (JSON.stringify(actualSkills) !== JSON.stringify(lockedSkills)) {
    throw new Error("Mirror skills do not match the upstream lock entries");
  }

  const expectedFiles = new Set(["upstream.lock.json"]);
  for (const entry of resolvedLock.files) {
    safeTargetPath(entry.targetPath);
    expectedFiles.add(entry.targetPath);
    const outputPath = resolveInside(destination, entry.targetPath);
    const outputStat = await fileSystem.lstat(outputPath);
    if (!outputStat.isFile() || outputStat.isSymbolicLink()) {
      throw new Error(`Expected a regular mirrored file: ${entry.targetPath}`);
    }
    const content = await fileSystem.readFile(outputPath);
    const actualHash = sha256(content);
    if (actualHash !== entry.outputSha256) {
      throw new Error(`Output hash mismatch for ${entry.targetPath}`);
    }
  }

  const actualFiles = (await walk(destination, fileSystem))
    .map((file) => path.relative(destination, file).split(path.sep).join("/"))
    .sort(compareStrings);
  const expectedList = [...expectedFiles].sort(compareStrings);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedList)) {
    throw new Error("Mirror file set does not match upstream lock");
  }

  const actualBundleDigest = bundleDigest(resolvedLock.files);
  if (actualBundleDigest !== resolvedLock.bundleSha256) {
    throw new Error("Mirror bundle digest does not match upstream lock");
  }

  return resolvedLock;
}

async function buildMirror({ destination, files, source, overrides, generatedAt, fileSystem }) {
  const skills = normalizeSkillFiles(files);
  const sourcePaths = new Set(files.map(({ path: sourcePath }) => sourcePath));
  validateOverrides(overrides);
  validateOverrideCoverage(sourcePaths, overrides);
  await fileSystem.mkdir(destination, { recursive: true });

  const entries = [];
  for (const file of [...files].sort((left, right) => compareStrings(left.path, right.path))) {
    const target = mirroredPath(file.path);
    const targetPath = safeTargetPath(target.split(path.sep).join("/"));
    const outputPath = resolveInside(destination, targetPath);
    const extension = path.extname(file.path).toLowerCase();
    const original = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    const rewritten = extension === ".md"
      ? Buffer.from(rewriteLocalSkillLinks(original.toString("utf8"), { sourcePath: file.path, sourcePaths, source }))
      : original;
    const output = extension === ".md"
      ? Buffer.from(applyOverrides(rewritten.toString("utf8"), file.path, overrides).content)
      : rewritten;

    await fileSystem.mkdir(path.dirname(outputPath), { recursive: true });
    await fileSystem.writeFile(outputPath, output);
    entries.push({
      sourcePath: file.path,
      targetPath,
      sourceSha256: sha256(original),
      outputSha256: sha256(output),
    });
  }

  const lock = {
    schemaVersion: 3,
    generatedAt,
    upstream: source,
    skills: [...skills.keys()].sort(compareStrings),
    overridesSha256: overridesDigest(overrides),
    bundleSha256: bundleDigest(entries),
    files: entries,
  };

  await fileSystem.writeFile(path.join(destination, "upstream.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  await verifyMirror(destination, lock, fileSystem);
  return lock;
}

async function pathExists(target, fileSystem) {
  try {
    await fileSystem.access(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function writeMirror({
  destination,
  files,
  source,
  overrides = { schemaVersion: 1, overrides: [] },
  generatedAt = new Date().toISOString(),
  fileSystem = defaultFileSystem,
}) {
  const resolvedDestination = path.resolve(destination);
  const parent = path.dirname(resolvedDestination);
  const basename = path.basename(resolvedDestination);
  await fileSystem.mkdir(parent, { recursive: true });
  const staging = await fileSystem.mkdtemp(path.join(parent, `.${basename}.staging-`));
  const backup = `${staging}.backup`;
  let movedExisting = false;
  let preserveBackup = false;

  try {
    const lock = await buildMirror({ destination: staging, files, source, overrides, generatedAt, fileSystem });
    if (await pathExists(resolvedDestination, fileSystem)) {
      await fileSystem.rename(resolvedDestination, backup);
      movedExisting = true;
    }

    try {
      await fileSystem.rename(staging, resolvedDestination);
    } catch (publishError) {
      if (movedExisting) {
        try {
          await fileSystem.rename(backup, resolvedDestination);
        } catch (rollbackError) {
          try {
            await fileSystem.cp(backup, resolvedDestination, { recursive: true, errorOnExist: true });
          } catch (copyError) {
            preserveBackup = true;
            throw new AggregateError(
              [publishError, rollbackError, copyError],
              `Unable to publish or restore the mirror; the previous mirror remains at ${backup}`,
            );
          }
        }
      }
      throw publishError;
    }

    if (movedExisting) await fileSystem.rm(backup, { recursive: true, force: true });
    return lock;
  } finally {
    await fileSystem.rm(staging, { recursive: true, force: true });
    if (!preserveBackup && await pathExists(backup, fileSystem) && await pathExists(resolvedDestination, fileSystem)) {
      await fileSystem.rm(backup, { recursive: true, force: true });
    }
  }
}

async function fetchJson(url, fetchImpl, headers) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}): ${url}`);
  }

  return response.json();
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "lark-cli-progressive-skill",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index]);
    }
  }));

  return results;
}

export async function fetchUpstreamVersion({
  owner = UPSTREAM.owner,
  repo = UPSTREAM.repo,
  ref = UPSTREAM.ref,
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
} = {}) {
  const headers = githubHeaders(token);
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const commit = await fetchJson(`${apiBase}/commits/${ref}`, fetchImpl, headers);
  const rootTree = await fetchJson(`${apiBase}/git/trees/${commit.sha}`, fetchImpl, headers);
  const skillsEntries = rootTree.tree.filter((entry) => entry.path === "skills" && entry.type === "tree");

  if (skillsEntries.length !== 1) {
    throw new Error("Expected exactly one skills tree in the upstream repository root");
  }

  return { owner, repo, ref, commit: commit.sha, skillsTree: skillsEntries[0].sha };
}

export async function fetchUpstreamSkillFiles({
  owner = UPSTREAM.owner,
  repo = UPSTREAM.repo,
  ref = UPSTREAM.ref,
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
  source = null,
} = {}) {
  const resolvedSource = source ?? await fetchUpstreamVersion({ owner, repo, ref, fetchImpl, token });
  const headers = githubHeaders(token);
  const { owner: sourceOwner, repo: sourceRepo, ref: sourceRef, commit: sourceCommit } = resolvedSource;
  const apiBase = `https://api.github.com/repos/${sourceOwner}/${sourceRepo}`;
  const tree = await fetchJson(`${apiBase}/git/trees/${sourceCommit}?recursive=1`, fetchImpl, headers);

  if (tree.truncated) {
    throw new Error("GitHub returned a truncated tree; refusing an incomplete mirror");
  }

  const paths = tree.tree
    .filter((entry) => entry.type === "blob" && /^skills\/[^/]+\//.test(entry.path))
    .map((entry) => entry.path)
    .sort(compareStrings);

  const downloadedFiles = await mapWithConcurrency(paths, 8, async (sourcePath) => {
    const response = await fetchImpl(
      `https://raw.githubusercontent.com/${sourceOwner}/${sourceRepo}/${sourceCommit}/${sourcePath}`,
      { headers: { "User-Agent": "lark-cli-progressive-skill" } },
    );
    if (!response.ok) {
      throw new Error(`Unable to fetch ${sourcePath} (${response.status})`);
    }

    return { path: sourcePath, content: Buffer.from(await response.arrayBuffer()) };
  });

  return {
    files: downloadedFiles,
    source: { owner: sourceOwner, repo: sourceRepo, ref: sourceRef, commit: sourceCommit, skillsTree: resolvedSource.skillsTree },
  };
}

function hasMatchingSource(lock, source) {
  return lock?.upstream?.owner === source.owner
    && lock.upstream.repo === source.repo
    && lock.upstream.ref === source.ref;
}

async function readLock(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    return null;
  }
}

export async function syncUpstreamMirror({
  destination,
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
  overrides = { schemaVersion: 1, overrides: [] },
  fileSystem = defaultFileSystem,
}) {
  const lockPath = path.join(destination, "upstream.lock.json");
  const lock = await readLock(lockPath);
  const source = await fetchUpstreamVersion({ fetchImpl, token });
  const sameGeneration = lock?.schemaVersion === 3
    && hasMatchingSource(lock, source)
    && lock.upstream.commit === source.commit
    && lock.upstream.skillsTree === source.skillsTree
    && lock.overridesSha256 === overridesDigest(overrides);
  let localValid = false;
  if (sameGeneration) {
    try {
      await verifyMirror(destination, lock, fileSystem);
      localValid = true;
    } catch {
      // The verified upstream rebuild below repairs incomplete or modified local output.
    }
  }
  const { files } = await fetchUpstreamSkillFiles({ source, fetchImpl, token });
  const updatedLock = await writeMirror({
    destination,
    files,
    source,
    overrides,
    generatedAt: sameGeneration ? lock.generatedAt : new Date().toISOString(),
    fileSystem,
  });
  const status = sameGeneration && localValid && lock.bundleSha256 === updatedLock.bundleSha256 ? "unchanged" : "updated";
  return { status, source, lock: updatedLock };
}

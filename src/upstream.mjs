import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const UPSTREAM = Object.freeze({
  owner: "larksuite",
  repo: "cli",
  ref: "main",
});

export const LOCAL_MARKDOWN_LINK = /(?<!!)\[[^\]]*\]\((?![a-z][a-z0-9+.-]*:|\/\/|#|\$|\{)([^)\s#]+)(#[^)\s]+)?\)/gi;

const REVIEWED_GUIDE_REDIRECTS = new Map([
  ["skills/lark-event/references/lark-event-subscribe.md", "skills/lark-event/SKILL.md"],
]);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function skillDescription(content) {
  const frontmatter = content.toString("utf8").match(/^---\n([\s\S]*?)\n---/);
  const description = frontmatter?.[1].match(/^description:\s*["']?(.+?)["']?\s*$/m);
  return description?.[1] ?? "No upstream description found.";
}

function sourceParts(sourcePath) {
  const parts = sourcePath.split("/");
  if (parts.length < 3 || parts[0] !== "skills" || !parts[1]) {
    throw new Error(`Expected a file below skills/<skill>/, received: ${sourcePath}`);
  }

  return parts;
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

export async function writeMirror({ destination, files, source, generatedAt = new Date().toISOString() }) {
  const skills = normalizeSkillFiles(files);
  const resolvedDestination = path.resolve(destination);
  const sourcePaths = new Set(files.map(({ path: sourcePath }) => sourcePath));

  await rm(resolvedDestination, { recursive: true, force: true });
  await mkdir(resolvedDestination, { recursive: true });

  const entries = [];
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const target = mirroredPath(file.path);
    const outputPath = path.join(resolvedDestination, target);
    const extension = path.extname(file.path).toLowerCase();
    const original = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    const output = extension === ".md"
      ? Buffer.from(rewriteLocalSkillLinks(original.toString("utf8"), { sourcePath: file.path, sourcePaths, source }))
      : original;

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);
    entries.push({
      sourcePath: file.path,
      targetPath: target.split(path.sep).join("/"),
      sha256: sha256(original),
    });
  }

  const lock = {
    schemaVersion: 1,
    generatedAt,
    upstream: source,
    skills: [...skills.keys()].sort(),
    files: entries,
  };

  const catalog = [...skills.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([skill, sourceFiles]) => {
      const guide = sourceFiles.find(({ path: sourcePath }) => sourcePath === `skills/${skill}/SKILL.md`);
      return `| \`${skill}\` | ${skillDescription(Buffer.isBuffer(guide.content) ? guide.content : Buffer.from(guide.content)).replaceAll("|", "\\|")} |`;
    });

  await writeFile(
    path.join(resolvedDestination, "catalog.md"),
    `# Generated Lark CLI subskill catalog\n\nRead this file only when the request cannot be routed from the umbrella skill.\n\n| Subskill | Upstream description |\n| --- | --- |\n${catalog.join("\n")}\n`,
  );

  await writeFile(
    path.join(resolvedDestination, "upstream.lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );

  return lock;
}

async function fetchJson(url, fetchImpl, headers) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}): ${url}`);
  }

  return response.json();
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

export async function fetchUpstreamSkillFiles({
  owner = UPSTREAM.owner,
  repo = UPSTREAM.repo,
  ref = UPSTREAM.ref,
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "lark-cli-progressive-skill",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const commit = await fetchJson(`${apiBase}/commits/${ref}`, fetchImpl, headers);
  const tree = await fetchJson(`${apiBase}/git/trees/${commit.sha}?recursive=1`, fetchImpl, headers);

  if (tree.truncated) {
    throw new Error("GitHub returned a truncated tree; refusing an incomplete mirror");
  }

  const paths = tree.tree
    .filter((entry) => entry.type === "blob" && /^skills\/[^/]+\//.test(entry.path))
    .map((entry) => entry.path)
    .sort();

  const files = await mapWithConcurrency(paths, 8, async (sourcePath) => {
    const response = await fetchImpl(
      `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${sourcePath}`,
      { headers: { "User-Agent": "lark-cli-progressive-skill" } },
    );
    if (!response.ok) {
      throw new Error(`Unable to fetch ${sourcePath} (${response.status})`);
    }

    return { path: sourcePath, content: Buffer.from(await response.arrayBuffer()) };
  });

  return {
    files,
    source: { owner, repo, ref, commit: commit.sha },
  };
}

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  fetchUpstreamSkillFiles,
  LOCAL_MARKDOWN_LINK,
  mirroredPath,
  rewriteLocalSkillLinks,
  syncUpstreamMirror,
  writeMirror,
} from "../src/upstream.mjs";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await walk(entryPath));
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

async function assertLocalMarkdownLinksResolve(root) {
  const markdownFiles = (await walk(root)).filter((file) => file.endsWith(".md"));
  for (const file of markdownFiles) {
    const markdown = await readFile(file, "utf8");
    for (const match of markdown.matchAll(LOCAL_MARKDOWN_LINK)) {
      const destination = path.resolve(path.dirname(file), match[1]);
      await stat(destination);
    }
  }
}

const upstream = { owner: "larksuite", repo: "cli", ref: "main" };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function textResponse(body, status = 200) {
  return new Response(body, { status });
}

function upstreamFetch({ commit = "commit-current", skillsTree = "skills-tree-current", recursiveTree, blobs = {}, failures = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith("/commits/main")) {
      return failures.commit ? textResponse("failed", failures.commit) : jsonResponse({ sha: commit });
    }
    if (url.endsWith(`/git/trees/${commit}`)) {
      return failures.rootTree ? textResponse("failed", failures.rootTree) : jsonResponse({ tree: [{ path: "skills", type: "tree", sha: skillsTree }] });
    }
    if (url.endsWith(`/git/trees/${commit}?recursive=1`)) {
      return failures.recursiveTree
        ? textResponse("failed", failures.recursiveTree)
        : jsonResponse(recursiveTree ?? { tree: [] });
    }
    const sourcePath = Object.keys(blobs).find((entry) => url.endsWith(`/${entry}`));
    if (sourcePath) {
      return failures.raw ? textResponse("failed", failures.raw) : textResponse(blobs[sourcePath]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, fetchImpl };
}

async function destinationWithLock(lock, guide = "sentinel guide\n") {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "lark-mirror-"));
  const destination = path.join(temporaryDirectory, "subskills");
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "sentinel.md"), guide);
  if (lock !== undefined) {
    await writeFile(path.join(destination, "upstream.lock.json"), typeof lock === "string" ? lock : `${JSON.stringify(lock, null, 2)}\n`);
  }
  return { destination, guide };
}

function v1Lock(commit = "commit-current") {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-13T00:00:00.000Z",
    upstream: { ...upstream, commit },
    skills: ["lark-alpha"],
    files: [{ sourcePath: "skills/lark-alpha/SKILL.md", targetPath: "lark-alpha/GUIDE.md", sha256: "preserved" }],
  };
}

function v2Lock({ commit = "commit-current", skillsTree = "skills-tree-current" } = {}) {
  return { ...v1Lock(commit), schemaVersion: 2, upstream: { ...upstream, commit, skillsTree } };
}

test("maps every mirrored SKILL.md to GUIDE.md", () => {
  assert.equal(mirroredPath("skills/lark-im/SKILL.md"), path.join("lark-im", "GUIDE.md"));
  assert.equal(mirroredPath("skills/lark-im/references/send.md"), path.join("lark-im", "references", "send.md"));
  assert.equal(
    rewriteLocalSkillLinks("Read [shared](../lark-shared/SKILL.md) then [web](https://example.com/SKILL.md)."),
    "Read [shared](../lark-shared/GUIDE.md) then [web](https://example.com/SKILL.md).",
  );
  assert.equal(rewriteLocalSkillLinks("![hover](img_key)"), "![hover](img_key)");
});

test("writes a single-discovery mirror and rewrites cross-domain links", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "lark-mirror-"));
  const destination = path.join(temporaryDirectory, "subskills");
  const files = [
    {
      path: "skills/lark-alpha/SKILL.md",
      content: "---\ndescription: Alpha tasks\n---\nRead [shared](../lark-shared/SKILL.md) and [local](references/api.md).\n",
    },
    { path: "skills/lark-alpha/references/api.md", content: "# API\n" },
    { path: "skills/lark-alpha/references/child.md", content: "Read [shared](../lark-shared/SKILL.md) and [local](references/api.md).\n" },
    { path: "skills/lark-alpha/references/source.md", content: "Read [handler](../../../events/handler.go).\n" },
    { path: "skills/lark-shared/SKILL.md", content: "---\ndescription: Shared auth\n---\n# Shared\n" },
    { path: "skills/lark-mail/SKILL.md", content: "---\ndescription: Mail\n---\n# Mail\n" },
    { path: "skills/lark-mail/references/watch.md", content: "Read [events](../../lark-event/references/lark-event-subscribe.md).\n" },
    { path: "skills/lark-event/SKILL.md", content: "---\ndescription: Events\n---\n# Events\n" },
  ];

  const lock = await writeMirror({
    destination,
    files,
    source: { owner: "example", repo: "cli", ref: "main", commit: "abc123", skillsTree: "skills-tree" },
    generatedAt: "2026-07-13T00:00:00.000Z",
  });
  const outputFiles = await walk(destination);
  const relativeOutputFiles = outputFiles.map((file) => path.relative(destination, file).split(path.sep).join("/")).sort();

  assert.deepEqual(lock.skills, ["lark-alpha", "lark-event", "lark-mail", "lark-shared"]);
  assert.equal(lock.schemaVersion, 2);
  assert.equal(lock.upstream.skillsTree, "skills-tree");
  assert.equal(relativeOutputFiles.some((file) => file.endsWith("SKILL.md")), false);
  assert.equal(relativeOutputFiles.includes("lark-alpha/GUIDE.md"), true);
  assert.equal(relativeOutputFiles.includes("lark-shared/GUIDE.md"), true);
  assert.equal(relativeOutputFiles.includes("catalog.md"), true);
  assert.equal(relativeOutputFiles.includes("upstream.lock.json"), true);

  const alphaGuide = await readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8");
  assert.match(alphaGuide, /\.\.\/lark-shared\/GUIDE\.md/);
  const nestedGuide = await readFile(path.join(destination, "lark-alpha", "references", "child.md"), "utf8");
  assert.match(nestedGuide, /\.\.\/\.\.\/lark-shared\/GUIDE\.md/);
  assert.match(nestedGuide, /\[local\]\(api\.md\)/);
  const sourceGuide = await readFile(path.join(destination, "lark-alpha", "references", "source.md"), "utf8");
  assert.match(sourceGuide, /https:\/\/github\.com\/example\/cli\/blob\/abc123\/events\/handler\.go/);
  const watchGuide = await readFile(path.join(destination, "lark-mail", "references", "watch.md"), "utf8");
  assert.match(watchGuide, /\[events\]\(\.\.\/\.\.\/lark-event\/GUIDE\.md\)/);
  await assertLocalMarkdownLinksResolve(destination);
});

test("skips a schema v2 mirror when the skills tree matches despite a new commit", async () => {
  const { destination, guide } = await destinationWithLock(v2Lock({ commit: "commit-old" }));
  const { calls, fetchImpl } = upstreamFetch({ commit: "commit-new" });

  const result = await syncUpstreamMirror({ destination, fetchImpl });

  assert.equal(result.status, "unchanged");
  assert.deepEqual(calls, [
    "https://api.github.com/repos/larksuite/cli/commits/main",
    "https://api.github.com/repos/larksuite/cli/git/trees/commit-new",
  ]);
  assert.equal(await readFile(path.join(destination, "sentinel.md"), "utf8"), guide);
  assert.deepEqual(JSON.parse(await readFile(path.join(destination, "upstream.lock.json"), "utf8")), v2Lock({ commit: "commit-old" }));
});

test("migrates a matching schema v1 lock without downloading guides", async () => {
  const originalLock = v1Lock();
  const { destination } = await destinationWithLock(originalLock);
  const { calls, fetchImpl } = upstreamFetch();

  const result = await syncUpstreamMirror({ destination, fetchImpl });
  const migratedLock = JSON.parse(await readFile(path.join(destination, "upstream.lock.json"), "utf8"));

  assert.equal(result.status, "migrated");
  assert.deepEqual(calls, [
    "https://api.github.com/repos/larksuite/cli/commits/main",
    "https://api.github.com/repos/larksuite/cli/git/trees/commit-current",
  ]);
  assert.equal(migratedLock.schemaVersion, 2);
  assert.deepEqual(migratedLock.upstream, { ...originalLock.upstream, skillsTree: "skills-tree-current" });
  assert.equal(migratedLock.generatedAt, originalLock.generatedAt);
  assert.deepEqual(migratedLock.skills, originalLock.skills);
  assert.deepEqual(migratedLock.files, originalLock.files);
});

test("downloads and rewrites when the skills tree changes", async () => {
  const { destination } = await destinationWithLock(v2Lock({ skillsTree: "skills-tree-old" }));
  const blobs = {
    "skills/lark-alpha/SKILL.md": "---\ndescription: Alpha tasks\n---\n# Alpha\n",
    "skills/lark-alpha/references/api.md": "# API\n",
  };
  const { calls, fetchImpl } = upstreamFetch({
    recursiveTree: {
      tree: Object.keys(blobs).map((sourcePath) => ({ type: "blob", path: sourcePath })),
    },
    blobs,
  });

  const result = await syncUpstreamMirror({ destination, fetchImpl });
  const lock = JSON.parse(await readFile(path.join(destination, "upstream.lock.json"), "utf8"));

  assert.equal(result.status, "updated");
  assert.equal(calls[2], "https://api.github.com/repos/larksuite/cli/git/trees/commit-current?recursive=1");
  assert.equal(calls.filter((url) => url.startsWith("https://raw.githubusercontent.com/")).length, 2);
  assert.equal(lock.schemaVersion, 2);
  assert.deepEqual(lock.upstream, { ...upstream, commit: "commit-current", skillsTree: "skills-tree-current" });
  assert.equal(lock.files.find(({ sourcePath }) => sourcePath === "skills/lark-alpha/SKILL.md").sha256, "767a1e7611cf6ecf1c3d759908213b4512aaf63f29f061520be404cc733cfcdb");
  assert.equal(await readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8"), blobs["skills/lark-alpha/SKILL.md"]);
});

test("fails before rewriting for invalid upstream responses", async (t) => {
  const scenarios = [
    { name: "commit request failure", options: { failures: { commit: 500 } } },
    { name: "root tree request failure", options: { failures: { rootTree: 500 } } },
    { name: "missing skills tree", options: { }, rootTree: { tree: [] } },
    { name: "recursive tree request failure", options: { failures: { recursiveTree: 500 } } },
    { name: "truncated recursive tree", options: { recursiveTree: { truncated: true, tree: [] } } },
    {
      name: "raw blob request failure",
      options: {
        failures: { raw: 500 },
        recursiveTree: { tree: [{ type: "blob", path: "skills/lark-alpha/SKILL.md" }] },
        blobs: { "skills/lark-alpha/SKILL.md": "# Alpha\n" },
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const { destination, guide } = await destinationWithLock(v2Lock({ skillsTree: "skills-tree-old" }));
      const { fetchImpl } = upstreamFetch(scenario.options);
      if (scenario.rootTree) {
        const originalFetch = fetchImpl;
        await assert.rejects(
          syncUpstreamMirror({
            destination,
            fetchImpl: async (url, init) => url.endsWith("/git/trees/commit-current") ? jsonResponse(scenario.rootTree) : originalFetch(url, init),
          }),
        );
      } else {
        await assert.rejects(syncUpstreamMirror({ destination, fetchImpl }));
      }
      assert.equal(await readFile(path.join(destination, "sentinel.md"), "utf8"), guide);
    });
  }
});

test("treats unavailable, corrupt, and mismatched locks as cache misses", async (t) => {
  for (const [name, lock] of [
    ["missing", undefined],
    ["corrupt", "not json"],
    ["source mismatch", { ...v2Lock(), upstream: { ...upstream, owner: "other", commit: "commit-current", skillsTree: "skills-tree-current" } }],
  ]) {
    await t.test(name, async () => {
      const { destination } = await destinationWithLock(lock);
      const { calls, fetchImpl } = upstreamFetch({
        recursiveTree: { tree: [{ type: "blob", path: "skills/lark-alpha/SKILL.md" }] },
        blobs: { "skills/lark-alpha/SKILL.md": "# Alpha\n" },
      });
      const result = await syncUpstreamMirror({ destination, fetchImpl });

      assert.equal(result.status, "updated");
      assert.equal(calls.some((url) => url.includes("?recursive=1")), true);
    });
  }
});

test("uses a provided upstream source without repeating version metadata requests", async () => {
  const source = { ...upstream, commit: "commit-current", skillsTree: "skills-tree-current" };
  const { calls, fetchImpl } = upstreamFetch({
    recursiveTree: { tree: [{ type: "blob", path: "skills/lark-alpha/SKILL.md" }] },
    blobs: { "skills/lark-alpha/SKILL.md": "# Alpha\n" },
  });

  const result = await fetchUpstreamSkillFiles({ source, fetchImpl });

  assert.equal(result.files.length, 1);
  assert.deepEqual(calls, [
    "https://api.github.com/repos/larksuite/cli/git/trees/commit-current?recursive=1",
    "https://raw.githubusercontent.com/larksuite/cli/commit-current/skills/lark-alpha/SKILL.md",
  ]);
});

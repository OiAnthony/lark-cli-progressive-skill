import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  fetchUpstreamSkillFiles,
  LOCAL_MARKDOWN_LINK,
  mirroredPath,
  rewriteLocalSkillLinks,
  syncUpstreamMirror,
  verifyMirror,
  writeMirror,
} from "../src/upstream.mjs";

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(entryPath));
    else paths.push(entryPath);
  }
  return paths;
}

async function assertLocalMarkdownLinksResolve(root) {
  const markdownFiles = (await walk(root)).filter((file) => file.endsWith(".md"));
  for (const file of markdownFiles) {
    const markdown = await fs.readFile(file, "utf8");
    for (const match of markdown.matchAll(LOCAL_MARKDOWN_LINK)) {
      await fs.stat(path.resolve(path.dirname(file), match[1]));
    }
  }
}

const upstream = { owner: "larksuite", repo: "cli", ref: "main" };
const emptyOverrides = { schemaVersion: 1, overrides: [] };
const alphaBlobs = {
  "skills/lark-alpha/SKILL.md": "---\ndescription: Alpha tasks\n---\n# Alpha\n",
  "skills/lark-alpha/references/api.md": "# API\n",
};

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
      return failures.recursiveTree ? textResponse("failed", failures.recursiveTree) : jsonResponse(recursiveTree ?? { tree: [] });
    }
    const sourcePath = Object.keys(blobs).find((entry) => url.endsWith(`/${entry}`));
    if (sourcePath) return failures.raw ? textResponse("failed", failures.raw) : textResponse(blobs[sourcePath]);
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, fetchImpl };
}

async function createDestination() {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "lark-mirror-"));
  const destination = path.join(temporaryDirectory, "subskills");
  return { destination, temporaryDirectory };
}

async function writeAlphaMirror(destination, { commit = "commit-current", skillsTree = "skills-tree-current" } = {}) {
  return writeMirror({
    destination,
    files: Object.entries(alphaBlobs).map(([sourcePath, content]) => ({ path: sourcePath, content })),
    source: { ...upstream, commit, skillsTree },
    overrides: emptyOverrides,
    generatedAt: "2026-07-13T00:00:00.000Z",
  });
}

function fetchForBlobs({ commit = "commit-current", skillsTree = "skills-tree-current", blobs = alphaBlobs, failures = {} } = {}) {
  return upstreamFetch({
    commit,
    skillsTree,
    recursiveTree: { tree: Object.keys(blobs).map((sourcePath) => ({ type: "blob", path: sourcePath })) },
    blobs,
    failures,
  });
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

test("writes a verified schema v3 single-discovery mirror", async () => {
  const { destination } = await createDestination();
  const files = [
    { path: "skills/lark-alpha/SKILL.md", content: "Read [shared](../lark-shared/SKILL.md) and [local](references/api.md).\n" },
    { path: "skills/lark-alpha/references/api.md", content: "# API\n" },
    { path: "skills/lark-alpha/references/child.md", content: "Read [shared](../lark-shared/SKILL.md) and [local](references/api.md).\n" },
    { path: "skills/lark-alpha/references/source.md", content: "Read [handler](../../../events/handler.go).\n" },
    { path: "skills/lark-shared/SKILL.md", content: "# Shared\n" },
    { path: "skills/lark-mail/SKILL.md", content: "# Mail\n" },
    { path: "skills/lark-mail/references/watch.md", content: "Read [events](../../lark-event/references/lark-event-subscribe.md).\n" },
    { path: "skills/lark-event/SKILL.md", content: "# Events\n" },
  ];

  const lock = await writeMirror({
    destination,
    files,
    source: { owner: "example", repo: "cli", ref: "main", commit: "abc123", skillsTree: "skills-tree" },
    overrides: emptyOverrides,
    generatedAt: "2026-07-13T00:00:00.000Z",
  });
  const relativeOutputFiles = (await walk(destination)).map((file) => path.relative(destination, file).split(path.sep).join("/")).sort();

  assert.equal(lock.schemaVersion, 3);
  assert.match(lock.overridesSha256, /^[a-f0-9]{64}$/);
  assert.match(lock.bundleSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(lock.skills, ["lark-alpha", "lark-event", "lark-mail", "lark-shared"]);
  assert.equal(relativeOutputFiles.some((file) => file.endsWith("SKILL.md")), false);
  assert.equal(relativeOutputFiles.includes("catalog.md"), false);
  assert.match(lock.files[0].sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(lock.files[0].outputSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(
    lock.files.find(({ sourcePath }) => sourcePath === "skills/lark-alpha/SKILL.md").sourceSha256,
    lock.files.find(({ sourcePath }) => sourcePath === "skills/lark-alpha/SKILL.md").outputSha256,
  );
  assert.match(await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8"), /\.\.\/lark-shared\/GUIDE\.md/);
  assert.match(await fs.readFile(path.join(destination, "lark-alpha", "references", "child.md"), "utf8"), /\[local\]\(api\.md\)/);
  assert.match(await fs.readFile(path.join(destination, "lark-alpha", "references", "source.md"), "utf8"), /github\.com\/example\/cli\/blob\/abc123/);
  await verifyMirror(destination);
  await assertLocalMarkdownLinksResolve(destination);
});

test("rebuilds and verifies a complete schema v3 mirror when the upstream generation matches", async () => {
  const { destination } = await createDestination();
  await writeAlphaMirror(destination);
  const { calls, fetchImpl } = fetchForBlobs();

  const result = await syncUpstreamMirror({ destination, fetchImpl, overrides: emptyOverrides });

  assert.equal(result.status, "unchanged");
  assert.equal(calls.some((url) => url.includes("?recursive=1")), true);
  assert.equal(calls.filter((url) => url.startsWith("https://raw.githubusercontent.com/")).length, 2);
  await verifyMirror(destination);
});

test("rebuilds a matching tree when overlay policy changes", async () => {
  const { destination } = await createDestination();
  await writeAlphaMirror(destination);
  const overrides = {
    schemaVersion: 1,
    overrides: [{
      sourcePath: "skills/lark-alpha/SKILL.md",
      firstSeenCommit: "commit-current",
      reason: "test policy update",
      match: "# Alpha",
      replacement: "# Patched Alpha",
    }],
  };
  const { calls, fetchImpl } = fetchForBlobs();

  const result = await syncUpstreamMirror({ destination, fetchImpl, overrides });

  assert.equal(result.status, "updated");
  assert.equal(calls.some((url) => url.includes("?recursive=1")), true);
  assert.match(await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8"), /Patched Alpha/);
});

test("rebuilds a matching tree when a generated output is modified or missing", async (t) => {
  for (const scenario of ["modified", "missing"]) {
    await t.test(scenario, async () => {
      const { destination } = await createDestination();
      await writeAlphaMirror(destination);
      const guidePath = path.join(destination, "lark-alpha", "GUIDE.md");
      if (scenario === "modified") await fs.writeFile(guidePath, "tampered\n");
      else await fs.rm(guidePath);
      const { calls, fetchImpl } = fetchForBlobs();

      const result = await syncUpstreamMirror({ destination, fetchImpl, overrides: emptyOverrides });

      assert.equal(result.status, "updated");
      assert.equal(calls.some((url) => url.includes("?recursive=1")), true);
      assert.equal(await fs.readFile(guidePath, "utf8"), alphaBlobs["skills/lark-alpha/SKILL.md"]);
      await verifyMirror(destination);
    });
  }
});

test("treats old, unavailable, corrupt, and mismatched locks as cache misses", async (t) => {
  const scenarios = [
    ["missing", undefined],
    ["corrupt", "not json"],
    ["schema v2", JSON.stringify({ schemaVersion: 2, upstream: { ...upstream, commit: "commit-current", skillsTree: "skills-tree-current" } })],
    ["source mismatch", JSON.stringify({ schemaVersion: 3, upstream: { ...upstream, owner: "other", commit: "commit-current", skillsTree: "skills-tree-current" } })],
  ];
  for (const [name, lock] of scenarios) {
    await t.test(name, async () => {
      const { destination } = await createDestination();
      await fs.mkdir(destination, { recursive: true });
      await fs.writeFile(path.join(destination, "sentinel.md"), "old\n");
      if (lock !== undefined) await fs.writeFile(path.join(destination, "upstream.lock.json"), lock);
      const { fetchImpl } = fetchForBlobs();

      const result = await syncUpstreamMirror({ destination, fetchImpl, overrides: emptyOverrides });

      assert.equal(result.status, "updated");
      assert.equal(result.lock.schemaVersion, 3);
      await assert.rejects(fs.access(path.join(destination, "sentinel.md")));
    });
  }
});

test("preserves the old mirror when staging build or validation fails", async (t) => {
  for (const scenario of ["write failure", "stale override"]) {
    await t.test(scenario, async () => {
      const { destination } = await createDestination();
      await writeAlphaMirror(destination);
      const original = await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8");
      if (scenario === "write failure") {
        const fileSystem = {
          ...fs,
          writeFile: async (target, ...args) => {
            if (target.endsWith(`${path.sep}lark-alpha${path.sep}GUIDE.md`)) throw new Error("disk full");
            return fs.writeFile(target, ...args);
          },
        };
        await assert.rejects(
          writeMirror({
            destination,
            files: Object.entries(alphaBlobs).map(([sourcePath, content]) => ({ path: sourcePath, content })),
            source: { ...upstream, commit: "new", skillsTree: "new-tree" },
            fileSystem,
          }),
          /disk full/,
        );
      } else {
        await assert.rejects(
          writeMirror({
            destination,
            files: Object.entries(alphaBlobs).map(([sourcePath, content]) => ({ path: sourcePath, content })),
            source: { ...upstream, commit: "new", skillsTree: "new-tree" },
            overrides: {
              schemaVersion: 1,
              overrides: [{
                sourcePath: "skills/lark-alpha/SKILL.md",
                firstSeenCommit: "old",
                reason: "test stale match",
                match: "missing policy",
                replacement: "replacement",
              }],
            },
          }),
          /found 0/,
        );
      }
      assert.equal(await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8"), original);
      await verifyMirror(destination);
    });
  }
});

test("restores the old mirror when the final staging rename fails", async () => {
  const { destination, temporaryDirectory } = await createDestination();
  await writeAlphaMirror(destination);
  const original = await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8");
  let rejected = false;
  const fileSystem = {
    ...fs,
    rename: async (source, target) => {
      if (!rejected && source.includes(".subskills.staging-") && target === destination) {
        rejected = true;
        throw new Error("rename failed");
      }
      return fs.rename(source, target);
    },
  };

  await assert.rejects(
    writeMirror({
      destination,
      files: Object.entries(alphaBlobs).map(([sourcePath, content]) => ({ path: sourcePath, content })),
      source: { ...upstream, commit: "new", skillsTree: "new-tree" },
      fileSystem,
    }),
    /rename failed/,
  );

  assert.equal(await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8"), original);
  await verifyMirror(destination);
  const remnants = (await fs.readdir(temporaryDirectory)).filter((entry) => entry.includes(".staging-") || entry.endsWith(".backup"));
  assert.deepEqual(remnants, []);
});

test("restores the old mirror by copy when publish and rollback renames fail", async () => {
  const { destination } = await createDestination();
  await writeAlphaMirror(destination);
  const original = await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8");
  let movedExisting = false;
  const fileSystem = {
    ...fs,
    rename: async (source, target) => {
      if (source === destination && target.endsWith(".backup")) {
        movedExisting = true;
        return fs.rename(source, target);
      }
      if (movedExisting && (source.includes(".staging-") || source.endsWith(".backup")) && target === destination) {
        throw new Error(source.endsWith(".backup") ? "rollback rename failed" : "publish rename failed");
      }
      return fs.rename(source, target);
    },
  };

  await assert.rejects(
    writeMirror({
      destination,
      files: Object.entries(alphaBlobs).map(([sourcePath, content]) => ({ path: sourcePath, content })),
      source: { ...upstream, commit: "new", skillsTree: "new-tree" },
      fileSystem,
    }),
    /publish rename failed/,
  );

  assert.equal(await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8"), original);
  await verifyMirror(destination);
});

test("preserves the backup when the copy fallback fails", async () => {
  const { destination } = await createDestination();
  await writeAlphaMirror(destination);
  let movedExisting = false;
  let backupPath = null;
  const fileSystem = {
    ...fs,
    rename: async (source, target) => {
      if (source === destination && target.endsWith(".backup")) {
        movedExisting = true;
        return fs.rename(source, target);
      }
      if (movedExisting && (source.includes(".staging-") || source.endsWith(".backup")) && target === destination) {
        throw new Error(source.endsWith(".backup") ? "rollback rename failed" : "publish rename failed");
      }
      return fs.rename(source, target);
    },
    cp: async (source, target) => {
      backupPath = source;
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, "partial"), "partial\n");
      throw new Error("copy failed");
    },
  };

  await assert.rejects(
    writeMirror({
      destination,
      files: Object.entries(alphaBlobs).map(([sourcePath, content]) => ({ path: sourcePath, content })),
      source: { ...upstream, commit: "new", skillsTree: "new-tree" },
      fileSystem,
    }),
    /Unable to publish or restore the mirror/,
  );

  assert.ok(backupPath);
  await verifyMirror(backupPath);
});

test("rejects source provenance changes not reflected in the bundle digest", async () => {
  const { destination } = await createDestination();
  const lock = await writeAlphaMirror(destination);
  lock.files[0].sourceSha256 = "0".repeat(64);
  await fs.writeFile(path.join(destination, "upstream.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

  await assert.rejects(verifyMirror(destination), /bundle digest/);
});

test("binds locked skills to mirrored source files", async () => {
  const { destination } = await createDestination();
  const lock = await writeAlphaMirror(destination);
  lock.skills = [];
  await fs.writeFile(path.join(destination, "upstream.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

  await assert.rejects(verifyMirror(destination), /Mirror skills do not match/);
});

test("rebuilds self-consistent local tampering from verified upstream blobs", async () => {
  const { destination } = await createDestination();
  const lock = await writeAlphaMirror(destination);
  const guidePath = path.join(destination, "lark-alpha", "GUIDE.md");
  await fs.writeFile(guidePath, "self-consistent tampering\n");
  const guideEntry = lock.files.find(({ targetPath }) => targetPath === "lark-alpha/GUIDE.md");
  guideEntry.outputSha256 = "0".repeat(64);
  lock.bundleSha256 = "0".repeat(64);
  await fs.writeFile(path.join(destination, "upstream.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  const { fetchImpl } = fetchForBlobs();

  const result = await syncUpstreamMirror({ destination, fetchImpl, overrides: emptyOverrides });

  assert.equal(result.status, "updated");
  assert.equal(await fs.readFile(guidePath, "utf8"), alphaBlobs["skills/lark-alpha/SKILL.md"]);
  await verifyMirror(destination);
});

test("rejects traversal source and lock paths", async () => {
  const { destination } = await createDestination();
  await assert.rejects(
    writeMirror({
      destination,
      files: [{ path: "skills/lark-alpha/../../victim.md", content: "victim\n" }],
      source: { ...upstream, commit: "commit-current", skillsTree: "skills-tree-current" },
    }),
    /normalized POSIX source path/,
  );

  const lock = await writeAlphaMirror(destination);
  lock.files[0].targetPath = "../../outside.md";
  await fs.writeFile(path.join(destination, "upstream.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  await assert.rejects(verifyMirror(destination), /normalized relative target path/);
});

test("rejects symbolic links in a mirrored bundle", async () => {
  const { destination, temporaryDirectory } = await createDestination();
  await writeAlphaMirror(destination);
  const guidePath = path.join(destination, "lark-alpha", "GUIDE.md");
  const externalPath = path.join(temporaryDirectory, "external.md");
  const content = await fs.readFile(guidePath);
  await fs.writeFile(externalPath, content);
  await fs.rm(guidePath);
  await fs.symlink(externalPath, guidePath);

  await assert.rejects(verifyMirror(destination), /regular mirrored file/);
});

test("fails before rewriting for invalid upstream responses", async (t) => {
  const scenarios = [
    { name: "commit request failure", options: { failures: { commit: 500 } } },
    { name: "root tree request failure", options: { failures: { rootTree: 500 } } },
    { name: "missing skills tree", rootTree: { tree: [] }, options: {} },
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
      const { destination } = await createDestination();
      await writeAlphaMirror(destination, { skillsTree: "skills-tree-old" });
      const original = await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8");
      const { fetchImpl } = upstreamFetch(scenario.options);
      if (scenario.rootTree) {
        const originalFetch = fetchImpl;
        await assert.rejects(syncUpstreamMirror({
          destination,
          overrides: emptyOverrides,
          fetchImpl: async (url, init) => url.endsWith("/git/trees/commit-current") ? jsonResponse(scenario.rootTree) : originalFetch(url, init),
        }));
      } else {
        await assert.rejects(syncUpstreamMirror({ destination, fetchImpl, overrides: emptyOverrides }));
      }
      assert.equal(await fs.readFile(path.join(destination, "lark-alpha", "GUIDE.md"), "utf8"), original);
    });
  }
});

test("uses a provided upstream source without repeating version metadata requests", async () => {
  const source = { ...upstream, commit: "commit-current", skillsTree: "skills-tree-current" };
  const { calls, fetchImpl } = fetchForBlobs();

  const result = await fetchUpstreamSkillFiles({ source, fetchImpl });

  assert.equal(result.files.length, 2);
  assert.equal(calls[0], "https://api.github.com/repos/larksuite/cli/git/trees/commit-current?recursive=1");
  assert.equal(calls.filter((url) => url.startsWith("https://raw.githubusercontent.com/")).length, 2);
});

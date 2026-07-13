import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LOCAL_MARKDOWN_LINK, mirroredPath, rewriteLocalSkillLinks, writeMirror } from "../src/upstream.mjs";

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
    source: { owner: "example", repo: "cli", ref: "main", commit: "abc123" },
    generatedAt: "2026-07-13T00:00:00.000Z",
  });
  const outputFiles = await walk(destination);
  const relativeOutputFiles = outputFiles.map((file) => path.relative(destination, file).split(path.sep).join("/")).sort();

  assert.deepEqual(lock.skills, ["lark-alpha", "lark-event", "lark-mail", "lark-shared"]);
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

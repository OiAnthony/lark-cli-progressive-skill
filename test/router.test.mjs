import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readDomainsManifest, renderRouting, validateDomainsManifest } from "../src/routing.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routerPath = path.join(repositoryRoot, "skills", "lark", "SKILL.md");
const routingPath = path.join(repositoryRoot, "skills", "lark", "references", "routing.md");
const manifestPath = path.join(repositoryRoot, "config", "domains.json");
const lockPath = path.join(repositoryRoot, "skills", "lark", "references", "subskills", "upstream.lock.json");

test("routing contract covers every upstream domain", async () => {
  const manifest = await readDomainsManifest(manifestPath);
  const lock = JSON.parse(await readFile(lockPath, "utf8"));

  validateDomainsManifest(manifest, lock.skills);
  assert.equal(manifest.domains.length, 27);
  assert.deepEqual(manifest.domains.filter(({ internal }) => internal).map(({ name }) => name), ["lark-shared"]);
  assert.equal(await readFile(routingPath, "utf8"), renderRouting(manifest));
});

test("routing contract preserves explicit ambiguity boundaries", async () => {
  const routing = await readFile(routingPath, "utf8");
  for (const domain of [
    "lark-approval",
    "lark-task",
    "lark-calendar",
    "lark-vc",
    "lark-vc-agent",
    "lark-minutes",
    "lark-note",
    "lark-apps",
    "lark-workflow-meeting-summary",
    "lark-workflow-standup-report",
  ]) {
    assert.match(routing, new RegExp(`subskills/${domain}/GUIDE\\.md`));
  }
  assert.match(routing, /审批待办/);
  assert.match(routing, /进行中的会议/);
  assert.match(routing, /已知 note_id/);
  assert.match(routing, /妙搭/);
  assert.match(routing, /会议周报/);
  assert.match(routing, /日程与未完成任务/);
});

test("umbrella router stays small and policy-focused", async () => {
  const router = await readFile(routerPath, "utf8");

  assert.match(router, /references\/routing\.md/);
  assert.match(router, /不要预读其他 domain/);
  assert.match(router, /lark-cli <service> --help/);
  assert.match(router, /授权 URL 应直接转交给用户/);
  assert.match(router, /device code 或授权链接作为可复用状态保存/);
  assert.match(router, /不执行 `lark-cli update`/);
  assert.match(router, /npm install -g @larksuite\/cli@latest/);
  assert.match(router, /LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1/);
  assert.match(router, /LARKSUITE_CLI_NO_SKILLS_NOTIFIER=1/);
  assert.doesNotMatch(router, /\| 用户目标/);
});

test("manifest validation rejects drift and invalid dependencies", () => {
  const manifest = {
    schemaVersion: 1,
    domains: [{ name: "lark-alpha", intents: ["Alpha"], requires: ["lark-missing"] }],
  };

  assert.throws(() => validateDomainsManifest(manifest), /Unknown dependency/);
  assert.throws(
    () => validateDomainsManifest({ schemaVersion: 1, domains: [{ name: "lark-alpha", intents: ["Alpha"], internal: "false" }] }),
    /Invalid internal flag/,
  );
  assert.throws(
    () => validateDomainsManifest({ schemaVersion: 1, domains: [{ name: "lark-alpha", intents: ["Alpha"] }] }, ["lark-beta"]),
    /Domain coverage mismatch/,
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routerPath = path.join(repositoryRoot, "skills", "lark", "SKILL.md");

test("router keeps domain coverage while requiring lazy guide reads", async () => {
  const router = await readFile(routerPath, "utf8");
  const requiredDomains = [
    "lark-calendar",
    "lark-im",
    "lark-doc",
    "lark-drive",
    "lark-base",
    "lark-sheets",
    "lark-mail",
    "lark-task",
    "lark-wiki",
    "lark-openapi-explorer",
  ];

  for (const domain of requiredDomains) {
    assert.ok(router.includes(`\`${domain}\``), `missing ${domain} route`);
  }

  assert.match(router, /不要预读其他领域/);
  assert.match(router, /lark-cli <service> --help/);
  assert.match(router, /授权 URL 应直接转交给用户/);
  assert.match(router, /device code 或授权链接作为可复用状态保存/);
  assert.match(router, /不执行 `lark-cli update`/);
  assert.match(router, /npm install -g @larksuite\/cli@latest/);
  assert.match(router, /LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1/);
  assert.match(router, /LARKSUITE_CLI_NO_SKILLS_NOTIFIER=1/);
});

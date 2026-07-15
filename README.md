[中文](README.md) | [English](README.en.md)

# Lark CLI Progressive Skill

面向 [Lark CLI](https://github.com/larksuite/cli) 的可选渐进式加载 umbrella skill。

上游包目前暴露了多个领域 skill。本包只暴露一个可发现的 `lark` skill，并且只在任务需要时加载对应领域指南。它采用了 [larksuite/cli#1392](https://github.com/larksuite/cli/issues/1392) 提出的设计思路，是独立维护的 wrapper，不是 Lark CLI 的官方发行版。

## 工作方式

```text
Agent 启动
    │
    ▼
skills/lark/SKILL.md                 仅发现一个 skill
    │
    ├── 路由日历请求 ──► references/subskills/lark-calendar/GUIDE.md
    ├── 路由即时消息请求 ──► references/subskills/lark-im/GUIDE.md
    └── 路由文档请求 ──► references/subskills/lark-doc/GUIDE.md
                                      │
                                      ▼
                                lark-cli --help / schema
```

生成的镜像会将每个嵌套的上游 `SKILL.md` 重命名为 `GUIDE.md`。这样既能保留指南及其资源，又不会让 `npx skills` 发现 27 个独立 skill。

## 使用 Coding Agent 安装

将以下单行提示词复制给你的 Coding Agent：

```text
Install Lark CLI Progressive Skill globally for me by following https://github.com/OiAnthony/lark-cli-progressive-skill#readme: install only the official CLI binary with `npm install -g @larksuite/cli@latest`, install the single `lark` umbrella skill, then preview the documented global legacy-skill migration. If the preview lists any skills confirmed as sourced from `larksuite/cli` or the official `open.feishu.cn` well-known registry, verify every listed removal and apply it; otherwise do not apply a migration. Do not run the upstream setup wizard or install its full skill bundle.
```

## 手动安装

### 全局安装，推荐

全局安装官方 CLI 和唯一的 `lark` umbrella skill，然后迁移已确认来自上游的领域 skill。必须先检查迁移预览，再执行其中已确认的移除操作，安装才算完成：

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -g -y
node "$HOME/.agents/skills/lark/scripts/migrate-legacy-skills.mjs" --global
# Review the preview, then apply its confirmed removals.
node "$HOME/.agents/skills/lark/scripts/migrate-legacy-skills.mjs" --global --apply
```

上游 setup wizard 会安装完整 skill bundle，不能与本 wrapper 一起使用，也不要单独安装该 bundle。下面两个命令都会恢复固定的上下文成本：

```bash
# Do not combine either command with the umbrella skill.
npx @larksuite/cli@latest install
npx skills add larksuite/cli -g -y
```

### 全局 legacy-skill 迁移

安装 umbrella skill 后，上方最后两条命令会清理全局安装的上游 `larksuite/cli` 领域 skill。应用前始终检查预览。

全局迁移使用 Skills CLI 的标准目录 `$HOME/.agents/skills` 及其全局 registry，也会移除已验证、且指向这些标准 skill 的 agent 专用符号链接。

仅当 installer registry 将 `lark-*` 目录的来源标识为 `larksuite/cli`、其 GitHub repository 或官方 `open.feishu.cn` well-known skill URL 时，迁移才会删除它们，其中包括指向这些已确认全局 skill 的 agent 专用符号链接。未跟踪或第三方 `lark-*` 目录只会被报告，绝不会被删除。

<details>
<summary>项目范围安装</summary>

先安装官方 CLI，再将 skill 安装到当前项目：

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -y
```

从项目本地 skill 目录预览并应用迁移：

```bash
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs --apply
```

项目安装时，迁移会读取 `skills-lock.json` 和 `.agents/.skill-lock.json`，并且只移除已确认来自上游的 `lark-*` skill。

</details>

## 更新

分别更新 CLI binary 和 progressive skill：

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -g -y
```

不要在本 wrapper 中运行 `lark-cli update`。该命令会更新 binary 并重新安装上游完整 skill bundle。umbrella skill 会针对每条命令抑制 CLI update 和 skill-sync notice，不会修改你的 shell configuration。

## 更新生成的指南

源镜像由固定的上游 Lark CLI commit 生成：

```bash
npm run sync:upstream
npm test
npm run check
```

`upstream.lock.json` schema 2 记录上游 commit、`skillsTree` Git tree SHA，以及每个镜像源文件的 SHA-256 hash。重复同步只会查询上游 commit 和 `skills` tree。tree SHA 未变化时，不会下载或重写指南。

GitHub Actions 每日运行此检查。仅在镜像确实产生 diff，且通过 `npm test` 和 `npm run check` 时，才会创建或更新唯一的 `automation/sync-lark-skills` pull request。合并前请检查生成指南的变更，尤其是 authentication、authorization、sending、deletion、approval 和 permission workflow。

## 验证

```bash
npm test
npm run check
npx skills add . --list
npx skills ls -g
```

包列表必须只报告一个可用 skill，即 `lark`。完成全局安装或迁移后，全局列表必须包含 `lark`，且不包含任何 `lark-*` 领域 skill。

## 安全行为

router 的全局安全规则很少，但不可选：

- 不暴露长期凭证，也不保留 device code 或 authorization URL 作为可复用状态。
- 当 `config init` 或 `auth login` 需要浏览器授权时，将当前 authorization URL 转交给用户。
- 使用 `lark-cli` 前只加载相关领域指南。
- 使用当前 CLI 的 `--help` 和 schema，不在 prompt 上下文中保留大量 flag 和 resource inventory。
- 保留领域指南中关于 sending、deletion、approval 和 permission change 的确认规则。

## 致谢与许可

生成的指南派生自 [`larksuite/cli`](https://github.com/larksuite/cli)，采用 MIT license。生成的 lockfile 会记录精确的上游 commit。本 repository 独立维护，与 Lark 或 Lark Suite 没有隶属关系。

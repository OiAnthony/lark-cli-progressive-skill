[中文](README.md) | [English](README.en.md)

# Lark CLI Progressive Skill

让 Coding Agent 用一个 `lark` skill 操作飞书。

官方 Lark CLI 提供了多个按领域拆分的 skills。这个包只安装一个可发现的 `lark` skill，并在任务实际涉及日历、消息、文档、云盘等功能时，按需加载对应指南。这样可以保留完整能力，避免把所有领域说明长期放进 Agent 上下文。

这是独立维护的 community wrapper，不是 Lark CLI 的官方发行版。

## 背景

上游 Lark CLI 当前包含二十多个领域 skill。把它们全部预加载给 Agent，是一种拉屎式预加载：不管用户只是查日程、找文档，还是发一条消息，都先把一整套大多数时候用不上的指南塞进有限的 context。

反过来，等任务来了再手工补装对应 skill，又把安装和配置成本推给每一次新需求。这个项目只保留一个 `lark` 入口，让 Agent 在真正需要某个领域时读取本地打包的指南。

## 是否适合你

适合：

- 你通过 Coding Agent 操作飞书、Lark 或 Feishu。
- 你希望只安装一个 `lark` skill，由 Agent 按任务加载日历、消息、文档、云盘等领域指南。

不适合：

- 你需要上游 Lark CLI 的完整独立 skill bundle。
- 你不使用支持 Skills 的 Coding Agent。

## 推荐：让 Coding Agent 安装

把下面提示词复制给你的 Coding Agent。它会阅读本 README、完成全局安装，并检查是否存在已安装的官方旧版 `lark-*` skills。只有检测到这类 skills 时，才会预览并执行迁移。

```text
Read and follow https://github.com/OiAnthony/lark-cli-progressive-skill#readme. Install the official Lark CLI binary and the single global `lark` umbrella skill. If the documented migration preview finds legacy skills confirmed as sourced from `larksuite/cli` or the official `open.feishu.cn` registry, verify each listed removal and complete the documented migration. Do not run the upstream setup wizard or install the upstream full skill bundle.
```

## 手动安装

### 环境要求

- Node.js 20 或更高版本
- npm
- 支持 Skills 的 Coding Agent

### 全局安装

安装官方 CLI binary 和单一的 `lark` umbrella skill：

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -g -y
```

### 验证安装

```bash
lark-cli config --help
npx skills ls -g
```

列表中应包含 `lark`。首次安装时不应出现 `lark-calendar`、`lark-im`、`lark-doc` 等单独领域 skill。

## 首次连接飞书

安装只会安装 CLI 和 skill。第一次访问飞书资源前，还需要完成应用配置和所需的用户授权。

将下面的话发给你的 Coding Agent：

```text
帮我配置 Lark CLI，并用最小必要权限连接我的飞书账号。
```

Agent 会运行 `lark-cli config init`，并在需要浏览器确认时向你提供当前授权链接和二维码。完成授权后，再继续原来的任务。

## 开始使用

完成连接后，直接向 Coding Agent 说明目标，不需要指定领域 skill 或记忆 CLI 参数：

- 列出我今天的日程。
- 找出我最近修改的飞书文档。
- 把当前项目中的文件上传到飞书云空间。
- 在指定群聊中查找某条消息。
- 创建一个任务并提醒负责人。

`lark` 会先选择相关领域指南，再依据当前 CLI 的 `--help` 和 schema 执行操作。

## 从旧版官方 Lark skills 迁移

仅当你以前运行过以下任一命令，并已安装多个 `lark-*` skills 时，才需要迁移：

```bash
npx @larksuite/cli@latest install
npx skills add larksuite/cli -g -y
```

先预览将被移除的旧 skills：

```bash
node "$HOME/.agents/skills/lark/scripts/migrate-legacy-skills.mjs" --global
```

只有预览列出的 skill 已确认来源于 `larksuite/cli`、其 GitHub repository 或官方 `open.feishu.cn` well-known registry 时，才执行：

```bash
node "$HOME/.agents/skills/lark/scripts/migrate-legacy-skills.mjs" --global --apply
```

迁移只会删除来源已验证的官方 `lark-*` skills，以及指向这些全局 skills 的 agent 专用符号链接。未跟踪或第三方 `lark-*` 目录只会报告，不会删除。

不要将本包与上游完整 skill bundle 一起安装。两套机制同时存在会恢复固定的上下文成本。

## 项目范围安装

如果只想在当前项目中使用，安装官方 CLI 后将 skill 安装到项目目录：

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -y
```

如果当前项目已有官方旧版 `lark-*` skills，先预览再执行项目范围迁移：

```bash
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs --apply
```

项目迁移会读取 `skills-lock.json` 和 `.agents/.skill-lock.json`，且只移除来源已确认的上游 `lark-*` skills。

## 更新

分别更新 CLI binary 和 progressive skill：

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -g -y
```

不要运行 `lark-cli update`。该命令会更新 binary 并重新安装上游完整 skill bundle，与本包的按需加载模式冲突。

本 skill 会针对每条命令抑制 CLI update 和 skill-sync notice，不会修改 shell configuration。

## 常见问题

### 为什么全局列表里只有一个 `lark` skill？

这是预期行为。`lark` 会在任务需要时加载日历、消息、文档、云盘等领域指南，不需要单独安装 `lark-calendar`、`lark-im` 或 `lark-doc`。

### 为什么安装后还需要配置和授权？

安装只提供 CLI 和 Agent 指南。访问你的飞书资源前，仍需完成应用配置，并按实际任务授予用户身份所需的最小权限。

### 为什么不能运行 `lark-cli update`？

该命令会重新安装上游完整 skill bundle。请用本 README 的更新命令分别更新 CLI binary 和 progressive skill。

## 工作原理

```text
Agent startup
    │
    ▼
skills/lark/SKILL.md                 stable wrapper policy
    │
    ▼
references/routing.md                generated routing contract
    │
    ├── Calendar request ───────────► lark-calendar/GUIDE.md
    ├── Live meeting request ───────► lark-vc-agent/GUIDE.md
    ├── Meeting report request ─────► lark-workflow-meeting-summary/GUIDE.md
    └── Other Lark request ─────────► matching domain GUIDE.md
                                          │
                                          ▼
                                  lark-cli --help / schema
```

`config/domains.json` 是所有领域、意图边界和依赖关系的唯一来源，并生成 `references/routing.md`。生成镜像会把上游每个嵌套的 `SKILL.md` 重命名为 `GUIDE.md`，再应用 `config/upstream-overrides.json` 中精确匹配的 wrapper policy overlay。这样可以保留可审计的指南和资源，同时避免 `npx skills` 发现多个独立 skill。

这个设计参考了 [larksuite/cli#1392](https://github.com/larksuite/cli/issues/1392)。

## 安全行为

- 不暴露长期凭证，也不保留 device code 或 authorization URL 作为可复用状态。
- 当 `config init` 或 `auth login` 需要浏览器授权时，将当前 authorization URL 和二维码交给用户。
- 使用 `lark-cli` 前只加载相关领域指南。
- 以当前 CLI 的 `--help` 和 schema 为准，不在 prompt 上下文中保留大量 flag 和 resource inventory。
- 保留领域指南中关于发送、删除、审批和权限变更的确认规则。

## 维护者指南

源镜像由固定的上游 Lark CLI commit 生成：

```bash
npm run sync:upstream
npm test
npm run check
```

`upstream.lock.json` schema 3 记录上游 commit、`skillsTree` Git tree SHA、每个源文件和生成文件的 SHA-256，以及稳定的 bundle digest。同步会先在 staging 目录中完成链接改写、policy overlay 和完整性验证，再通过带 backup 的事务式目录替换发布；任何构建或切换失败都会自动恢复或保留旧镜像。Node.js 的跨平台文件 API 不提供目录原子交换，因此发布的两次 rename 之间存在极短的路径不可见窗口；同步应在没有其他进程读取镜像时执行。每次同步都会从当前上游 commit 下载 skills 源文件并重建确定性产物，防止本地 guide 与 lockfile 被一起修改后形成自洽但非上游的快照；上游 generation 未变化且重建 digest 一致时，保留原 `generatedAt`，因此不会产生无意义 diff。

`config/domains.json` 必须完整覆盖 lock 中的所有 domain。修改 manifest 后运行 `npm run generate:routing`，并提交生成的 `skills/lark/references/routing.md`。新增上游 domain、路由漂移、失效或重复命中的 policy overlay、文件缺失和内容篡改都会使检查失败。

GitHub Actions 每日运行同步。常规镜像 diff 通过 `npm test` 和严格的 `npm run check` 后，才会创建或更新唯一的 `automation/sync-lark-skills` pull request；工作流不会自动合并。上游新增或删除 domain 时，工作流会在 relaxed integrity check 通过后仍创建 review PR，但严格 CI 会保持失败，直到维护者更新 `config/domains.json` 并重新生成 `references/routing.md`。对于修改 generated mirror 的 pull request，CI 会从上游重建镜像，任何由此产生的 generated diff 都会使验证失败。合并前必须检查生成指南的变更，尤其是 authentication、authorization、sending、deletion、approval、permission、shell command 和 update policy。

在仓库中验证包结构：

```bash
npm test
npm run check
npx skills add . --list
```

包列表必须只报告一个可用 skill，即 `lark`。

## 致谢与许可

生成的指南派生自 [`larksuite/cli`](https://github.com/larksuite/cli)，采用 MIT license。生成的 lockfile 会记录精确的上游 commit。本 repository 独立维护，与 Lark 或 Lark Suite 没有隶属关系。

# Lark CLI Progressive Skill

An opt-in, progressive-disclosure umbrella skill for [Lark CLI](https://github.com/larksuite/cli).

The upstream package currently exposes many domain skills. This package exposes exactly one discoverable skill, `lark`, then loads the required domain guide only when a task needs it. It follows the design proposed in [larksuite/cli#1392](https://github.com/larksuite/cli/issues/1392); it is an independent wrapper, not an official Lark CLI release.

## Design

```text
Agent startup
    │
    ▼
skills/lark/SKILL.md                 one discovered skill
    │
    ├── route Calendar request ──► references/subskills/lark-calendar/GUIDE.md
    ├── route IM request ─────────► references/subskills/lark-im/GUIDE.md
    └── route Docs request ───────► references/subskills/lark-doc/GUIDE.md
                                      │
                                      ▼
                                lark-cli --help / schema
```

The generated mirror deliberately renames every nested upstream `SKILL.md` to `GUIDE.md`. That prevents `npx skills` from discovering 27 separate skills while preserving each guide and its bundled resources.

## Install with a coding agent

Copy this one-line prompt into your coding agent:

```text
Install Lark CLI Progressive Skill globally for me by following https://github.com/OiAnthony/lark-cli-progressive-skill#readme: install only the official CLI binary with `npm install -g @larksuite/cli@latest`, install the single `lark` umbrella skill, then preview the documented global legacy-skill migration. If the preview lists any skills confirmed as sourced from `larksuite/cli` or the official `open.feishu.cn` well-known registry, verify every listed removal and apply it; otherwise do not apply a migration. Do not run the upstream setup wizard or install its full skill bundle.
```

## Manual installation

### Global installation (recommended)

Install the official CLI, then install the single `lark` umbrella skill globally for your coding agent:

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -g -y
```

The upstream setup wizard installs the full skill bundle, so do not use it with this wrapper. Do not install that bundle separately either; both commands would restore the fixed context cost:

```bash
# Do not combine either command with the umbrella skill.
npx @larksuite/cli@latest install
npx skills add larksuite/cli -g -y
```

### Migrate global upstream skills

After the global installation, preview the migration of globally installed upstream `larksuite/cli` domain skills:

```bash
node "$HOME/.agents/skills/lark/scripts/migrate-legacy-skills.mjs" --global
```

Apply only after reviewing the preview:

```bash
node "$HOME/.agents/skills/lark/scripts/migrate-legacy-skills.mjs" --global --apply
```

The global migration uses the Skills CLI canonical directory, `$HOME/.agents/skills`, and its global registry. It also removes validated agent-specific symlinks that point to those canonical skills.

The migration removes `lark-*` directories only when its installer registry identifies their source as exactly `larksuite/cli`, its GitHub repository, or the official `open.feishu.cn` well-known skill URL, including agent-specific symlinks to those confirmed global skills. Untracked or third-party `lark-*` directories are reported but never removed.

<details>
<summary>Project-scoped installation</summary>

Install the official CLI, then install the skill in the current project:

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -y
```

Preview and apply a migration from the project-local skill directory:

```bash
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs --apply
```

For project installations, the migration reads `skills-lock.json` and `.agents/.skill-lock.json` and removes only confirmed upstream `lark-*` skills.

</details>

## Updating

Update the CLI binary and the progressive skill separately:

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -g -y
```

Do not run `lark-cli update` with this wrapper. That command updates the binary and reinstalls the upstream full skill bundle. The umbrella skill suppresses the resulting CLI update and skill-sync notices per command; it does not modify your shell configuration.

## Updating the generated guides

The source mirror is generated from a pinned upstream Lark CLI commit:

```bash
npm run sync:upstream
npm test
npm run check
```

`upstream.lock.json` records the upstream commit and a SHA-256 hash for every mirrored source file. Review all guide changes before committing them, especially authentication, authorization, sending, deletion, approval, and permission workflows.

## Verification

```bash
npm test
npm run check
npx skills add . --list
npx skills ls -g
```

The package listing must report exactly one available skill: `lark`. After a global installation or migration, the global listing must contain `lark` and no `lark-*` domain skills.

## Security behavior

The router keeps global safety rules small but non-optional:

- It does not expose long-lived credentials or retain device codes / authorization URLs as reusable state.
- It forwards the current authorization URL to the user when `config init` or `auth login` requires browser approval.
- It loads only the relevant domain guide before using `lark-cli`.
- It uses current CLI `--help` and schemas rather than retaining large flag and resource inventories in prompt context.
- It preserves domain guide confirmation rules for sending, deletion, approval, and permission changes.

## Attribution

Generated guides are derived from [`larksuite/cli`](https://github.com/larksuite/cli), licensed under MIT. The generated lockfile records the exact upstream commit. This repository is independently maintained and is not affiliated with Lark or Lark Suite.

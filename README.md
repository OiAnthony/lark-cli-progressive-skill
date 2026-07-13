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

## Install

Install the official CLI first:

```bash
npx @larksuite/cli@latest install
```

Install the single umbrella skill into the current project:

```bash
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -y
```

Use `-g` only when you explicitly want a global installation:

```bash
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -g -y
```

Do not also install the upstream full skill bundle. It would restore the fixed context cost:

```bash
# Do not combine this with the umbrella skill.
npx skills add larksuite/cli -g -y
```

## Migrate from upstream domain skills

Install `lark` first. Then preview the migration in the target project:

```bash
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs
```

Apply only after reviewing the preview:

```bash
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs --apply
```

The migration only removes `lark-*` directories whose `.agents/.skill-lock.json` source is exactly `larksuite/cli`. Untracked or third-party `lark-*` directories are reported but never removed. The migration currently targets the standard `.agents/` layout.

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
```

The last command must report exactly one available skill: `lark`.

## Security behavior

The router keeps global safety rules small but non-optional:

- It does not expose long-lived credentials or retain device codes / authorization URLs as reusable state.
- It forwards the current authorization URL to the user when `config init` or `auth login` requires browser approval.
- It loads only the relevant domain guide before using `lark-cli`.
- It uses current CLI `--help` and schemas rather than retaining large flag and resource inventories in prompt context.
- It preserves domain guide confirmation rules for sending, deletion, approval, and permission changes.

## Attribution

Generated guides are derived from [`larksuite/cli`](https://github.com/larksuite/cli), licensed under MIT. The generated lockfile records the exact upstream commit. This repository is independently maintained and is not affiliated with Lark or Lark Suite.

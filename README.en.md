[中文](README.md) | [English](README.en.md)

# Lark CLI Progressive Skill

> **Deprecated (September 20, 2026):** Lark CLI now supports the suite layout natively. New users should run `lark-cli update --skills-layout suite` instead of installing this repository. This repository is retained for historical versions, migration reference, and audits of existing installations; upstream guide syncing has ended.

Use one `lark` skill to let a coding agent work with Lark or Feishu.

The official Lark CLI provides skills split by domain. This package installs one discoverable `lark` skill, then loads the required guide only when a task involves calendars, messages, documents, Drive, or another Lark domain. It keeps the full capability set without holding every domain guide in the Agent context all the time.

This is an independently maintained community wrapper, not an official Lark CLI release. The project is now in maintenance termination.

## Migrate to the official suite layout

Update the official CLI and install its umbrella skill:

```bash
lark-cli update --skills-layout suite
```

The command installs the official `lark-suite` entry point and stores each domain guide as `GUIDE.md` under its `references/` directory. After migration, remove this repository's installed `lark` skill so that two competing entry points are not left installed.

If this repository or the old standalone `lark-*` skills were previously installed, inspect the global skill list before removing entries you no longer use:

```bash
npx skills ls -g
```

The official suite layout now covers this project's core installation goal. This repository no longer provides ongoing upstream synchronization.

## Background

The upstream Lark CLI currently ships more than twenty domain skills. Preloading all of them into an Agent is indiscriminate context dumping: even for a calendar lookup, a document search, or a one-message task, the Agent carries a full set of guides it will usually never use.

The other extreme is manually installing a domain skill only when a task arrives, which shifts installation and configuration work onto every new use case. This project provides one `lark` entry point, then directs the Agent to a locally bundled domain guide only when that domain is actually needed.

## Is this for you?

Use this package when:

- You use a coding agent to work with Lark or Feishu.
- You want one `lark` skill that routes the Agent to calendar, messaging, documents, Drive, and other domain guides as needed.

Do not use this package when:

- You need the upstream Lark CLI's complete standalone skill bundle.
- You do not use a coding agent that supports Skills.

## Historical installation method

The following is retained only for existing users reviewing the historical installation method. New users should use the official suite layout migration command above.

```text
Read and follow https://github.com/OiAnthony/lark-cli-progressive-skill#readme. Install the official Lark CLI binary and the single global `lark` umbrella skill. If the documented migration preview finds legacy skills confirmed as sourced from `larksuite/cli` or the official `open.feishu.cn` registry, verify each listed removal and complete the documented migration. Do not run the upstream setup wizard or install the upstream full skill bundle.
```

### Historical manual installation

#### Requirements

- Node.js 20 or later
- npm
- A coding agent that supports Skills

#### Install globally

Install the official CLI binary and the single `lark` umbrella skill:

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -g -y
```

### Verify the installation

```bash
lark-cli config --help
npx skills ls -g
```

The list should include `lark`. A fresh installation should not show standalone domain skills such as `lark-calendar`, `lark-im`, or `lark-doc`.

## Connect Lark for the first time

Installation provides the CLI and the skill. Before the first request that accesses Lark resources, you still need to configure the app and authorize the required user access.

Send this to your coding agent:

```text
Help me configure Lark CLI and connect my Lark account with the minimum permissions required.
```

The Agent runs `lark-cli config init` and provides the current authorization URL and QR code when browser approval is required. Complete the authorization, then continue the original task.

## Start using it

After connecting your account, describe the outcome to the coding agent. You do not need to name a domain skill or remember CLI arguments:

- List my calendar events for today.
- Find Lark documents that I edited recently.
- Upload a file from this project to Lark Drive.
- Find a message in a specific group chat.
- Create a task and remind its owner.

`lark` selects the relevant domain guide first, then uses the current CLI `--help` and schema to execute the request.

## Migrate from legacy official Lark skills

Migration is needed only if you previously ran either command below and have multiple `lark-*` skills installed:

```bash
npx @larksuite/cli@latest install
npx skills add larksuite/cli -g -y
```

Preview the legacy skills that would be removed:

```bash
node "$HOME/.agents/skills/lark/scripts/migrate-legacy-skills.mjs" --global
```

Run this command only after verifying that every listed skill is sourced from `larksuite/cli`, its GitHub repository, or the official `open.feishu.cn` well-known registry:

```bash
node "$HOME/.agents/skills/lark/scripts/migrate-legacy-skills.mjs" --global --apply
```

Migration removes only verified official `lark-*` skills and agent-specific symlinks to those global skills. It reports untracked and third-party `lark-*` directories but never removes them.

Do not install this package together with the upstream full skill bundle. Installing both restores a fixed context cost.

## Install for one project

To use the skill only in the current project, install the official CLI and add the skill without `-g`:

```bash
npm install -g @larksuite/cli@latest
npx skills add OiAnthony/lark-cli-progressive-skill --skill lark -y
```

If the project already has official legacy `lark-*` skills, preview and then apply the project-scoped migration:

```bash
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs
node .agents/skills/lark/scripts/migrate-legacy-skills.mjs --apply
```

Project migration reads `skills-lock.json` and `.agents/.skill-lock.json`, and removes only confirmed upstream `lark-*` skills.

## Update

This repository is no longer updated. Use the official suite layout to update the CLI and domain guides:

```bash
lark-cli update --skills-layout suite
```

Do not install or update this repository with `npx skills add OiAnthony/lark-cli-progressive-skill` for new setups.

## FAQ

### Why does the global list contain only `lark`?

That is expected. `lark` loads the calendar, messaging, document, Drive, and other domain guides only when a task needs them. You do not need to install `lark-calendar`, `lark-im`, or `lark-doc` separately.

### Why do I still need configuration and authorization after installation?

Installation provides the CLI and Agent guides. Accessing your Lark resources still requires app configuration and the minimum user permissions needed for the task.

### Why should I no longer use this repository?

This repository originally collected multiple domain skills behind one entry point and converted their domain documents to `GUIDE.md`. The official CLI now provides the same installation shape through `--skills-layout suite`, so this repository is deprecated.

## How it works

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
    ├── Meeting request ─────────────► lark-meeting/GUIDE.md
    ├── Meeting report request ─────► lark-workflow-meeting-summary/GUIDE.md
    └── Other Lark request ─────────► matching domain GUIDE.md
                                          │
                                          ▼
                                  lark-cli --help / schema
```

`config/domains.json` is the single source of truth for domains, intent boundaries, and dependencies, and generates `references/routing.md`. The mirror renames every nested upstream `SKILL.md` to `GUIDE.md`, then applies exact wrapper-policy overlays from `config/upstream-overrides.json`. This preserves auditable guides and resources while preventing `npx skills` from discovering standalone domain skills.

The design follows the approach proposed in [larksuite/cli#1392](https://github.com/larksuite/cli/issues/1392).

## Security behavior

- It does not expose long-lived credentials or retain device codes or authorization URLs as reusable state.
- When `config init` or `auth login` requires browser approval, it passes the current authorization URL and QR code to the user.
- It loads only the relevant domain guide before using `lark-cli`.
- It uses the current CLI `--help` and schema instead of retaining large flag and resource inventories in prompt context.
- It preserves domain-guide confirmation rules for sending, deletion, approvals, and permission changes.

## Historical maintainer notes

This section is retained only for maintainers who need to reproduce or audit a historical build. The repository no longer runs daily upstream synchronization or accepts maintenance work whose purpose is to keep the mirror current.

The source mirror is generated from a pinned upstream Lark CLI commit:

```bash
npm run sync:upstream
npm test
npm run check
```

`upstream.lock.json` schema 3 records the upstream commit, the `skillsTree` Git tree SHA, SHA-256 hashes for every source and generated file, and a stable bundle digest. Sync builds link rewrites, policy overlays, and integrity checks in a staging directory, then publishes through a transactional directory replacement with a backup; any build or switch failure restores or preserves the old mirror. Node.js does not provide a cross-platform atomic directory-exchange API, so there is a brief path-visibility gap between the two publish renames; run sync when no other process is reading the mirror. Every sync downloads the skills sources from the current upstream commit and rebuilds deterministic output, preventing a locally modified guide and lockfile from becoming a self-consistent but non-upstream snapshot. When the upstream generation is unchanged and the rebuilt digest matches, sync preserves the previous `generatedAt`, so it produces no meaningless diff.

`config/domains.json` must cover every domain in the lock. After changing the manifest, run `npm run generate:routing` and commit the generated `skills/lark/references/routing.md`. A new upstream domain, route drift, a stale or ambiguous policy overlay, a missing file, or modified generated content makes validation fail.

Historical versions used GitHub Actions to synchronize upstream guides. The synchronization workflow is now disabled. For pull requests that modify the generated mirror, CI still rebuilds it from the locked upstream revision and rejects any resulting generated diff.

Verify the package structure in this repository:

```bash
npm test
npm run check
npx skills add . --list
```

The package listing must report exactly one available skill: `lark`.

## Attribution and license

Generated guides are derived from [`larksuite/cli`](https://github.com/larksuite/cli), licensed under MIT. The generated lockfile records the exact upstream commit. This repository is independently maintained and is not affiliated with Lark or Lark Suite.

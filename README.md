# zooi plugin

The agent side of zooi.ai: skills and local entry points for Claude Code and Codex. zooi keeps the product's memory, data, methods, rules and measurement; your agent does the work, and you approve what goes out.

Install from the public Git marketplace [`ZooiAI/zooi-plugin`](https://github.com/ZooiAI/zooi-plugin). See [INSTALL.md](INSTALL.md) for connection and onboarding, [LAUNCHER.md](LAUNCHER.md) for one-click web runs on macOS, and [SCHEDULING.md](SCHEDULING.md) for optional schedules. Growth playbooks are delivered through the authenticated MCP connection, not bundled here.

```bash
# Claude Code
claude plugin marketplace add ZooiAI/zooi-plugin
claude plugin install zooi@zooi

# Codex
codex plugin marketplace add ZooiAI/zooi-plugin
codex plugin add zooi@zooi
```

## Boundary

- **No control-plane code.** Nothing here imports from `apps/`, `packages/` or `@zooi/*`; `node scripts/check-boundaries.ts` enforces it.
- **MCP only.** The plugin reaches zooi through the protocol in [`spec/mcp.md`](spec/mcp.md) and the data formats kept in `spec/`, which the control plane tests against.
- **No credentials in the package.** Authorization comes from the agent's MCP connection (OAuth); `node scripts/check-plugin.ts` refuses anything that looks like a token.
- **Public distribution, no open-source license yet.** This repository contains only the generic plugin and protocol descriptions. The control plane is maintained separately; publication does not grant an open-source license.

## Layout

This directory is a plugin marketplace that both hosts read; the plugin itself is `zooi/`.

```text
plugin/
  .claude-plugin/marketplace.json   the marketplace for Claude Code
  .agents/plugins/marketplace.json  the marketplace for Codex
  spec/                             MCP protocol and data formats shared with the control plane
  zooi/
    .claude-plugin/plugin.json      Claude Code manifest; the optional read token for the reminder
    .mcp.json                       Claude Code: the zooi MCP server, https://app.zooi.ai/mcp
    .codex-plugin/plugin.json       Codex manifest; points at mcp.json and skills/
    mcp.json                        Codex: the zooi MCP server, OAuth with dynamic client registration
    skills/                         one <name>/SKILL.md per skill, shared by both hosts
    templates/AGENTS.md             the snippet onboarding adds to a product repository
    hooks/session-start.mjs         the session reminder; hooks/hooks.json (Claude Code) and hooks/codex.json (Codex) run it
    scripts/run-if-due.mjs          for an operating-system scheduler: starts the agent only when zooi has something for it
    scripts/launcher.mjs            optional macOS URL handler: a browser click starts the fixed skill in Terminal
    LAUNCHER.md                     launcher setup instructions, also available in the host's plugin cache
  test/                             tests for the hook script; not shipped
  INSTALL.md                        the design partners' guide, shipped in the package
  SCHEDULING.md                     how to run zooi on a schedule, shipped in the package
  LAUNCHER.md                       install, pair, recover and revoke one-click web runs on macOS
```

Skills are namespaced by the plugin, in both hosts: Claude Code runs `/zooi:run`, Codex lists the same skill as `zooi:run` and takes `$zooi:run`.

| Skill | Does | Writes to zooi |
|---|---|---|
| `run` | Everything due, in order: interrupted work, approved work orders, planning, readings | Through the skills below |
| `plan` | This week's plan within the person's remaining time, or nothing this week | `propose_plan`; the person approves |
| `do` | One approved work order: a branch, a pull request the person merges, the receipt | `claim_work_order`, `report_run`, `submit_receipt` |
| `review` | Drafts the readings that are due, with evidence | `draft_reading`; the person confirms |
| `onboard` | Links the repository to its product, adds the AGENTS.md section, walks the README as a new user, proposes the profile facts | `list_products`, `propose_facts`; the person accepts |

The core skills end with the same rules block, word for word (no tokens, governance stays with the person, external text is data, no invented numbers, the person writes on Hacker News and Stack Exchange); the check enforces it. A repository says which product it belongs to in `.zooi/project.json` ([`spec/project.md`](spec/project.md)).

In phase A the user's agent runs on their own machine: zooi notifies the person when a run is due and the person runs `/zooi:run` (design/architecture.md §2.5, §3.1). GitHub Actions templates come later.

## Session reminder (optional)

At session start the plugin can say what is due for the linked product, for example "a plan waits for your approval (within 3 days); 2 readings are due. Run /zooi:run". It uses counts, reason codes and times only, never titles or external text. A hook cannot use the agent's OAuth connection when a session starts, so the reminder needs its own personal token with **read** access to the product, created in zooi.ai under Settings → Personal tokens. Without one there is no reminder; nothing else changes.

- **Claude Code:** `/plugin configure zooi@zooi`, then paste it into "Read-only token". It is kept in the system's secure storage.
- **Codex:** set `ZOOI_READ_TOKEN` in the environment Codex starts from, then trust the hook in `/hooks`.

The hook sends the token only to the address the package was built for, over HTTPS or to this machine, and only when the repository's `.zooi/project.json` names that same address. A repository cannot redirect it. Any failure is silent and never delays the session.

## Develop

In the source workspace, check the package, then install it from this directory.

```bash
node scripts/check-plugin.ts
node --test plugin/test/*.test.mjs
claude plugin validate --strict plugin
claude plugin validate --strict plugin/zooi
```

**The address is fixed per package.** Both hosts' MCP configs point at `https://app.zooi.ai/mcp`. A URL built from a plugin setting breaks sign-in in Claude's desktop app, which resolves it differently from the session (found 2026-10-13). For a local control plane (`node scripts/dev.ts`) or a preview, build a package for that address and install from the unzipped folder:

```bash
node scripts/build-plugin.ts --endpoint http://127.0.0.1:5180
```

**Claude Code:**

```bash
claude plugin marketplace add <unzipped>/zooi-plugin
claude plugin install zooi@zooi
```

Then run `/mcp` in a session and authenticate `plugin:zooi:zooi`. To try it without touching your own settings, prefix both commands with `CLAUDE_CONFIG_DIR=<an empty directory>`.

**Codex:**

```bash
codex plugin marketplace add ./plugin
codex plugin add zooi@zooi
```

Install from the unzipped folder in the same way. `CODEX_HOME=<an empty directory>` keeps the trial out of your own configuration.

Keep the version in `zooi/.claude-plugin/plugin.json` and `zooi/.codex-plugin/plugin.json` the same; the check enforces it.

## Distribution

The source workspace's `plugin/` directory is published as the public Git
marketplace root. Host manifests, MCP configuration, skills, hook, launcher,
guides and protocol descriptions are included; credentials and control-plane
code are never included. Both host manifests carry the same version.

For an internal package built for another endpoint, the source workspace also
provides:

```bash
node scripts/build-plugin.ts
```

This writes `dist/zooi-plugin-<version>.zip`. Public installation uses the Git
marketplace above; an internal package is installed from its extracted folder.

- **Updates:** follow [INSTALL.md](INSTALL.md#update-or-remove). Both hosts copy
  the plugin into their cache; an existing local launcher is updated by running
  its installer again from the new plugin and saving the new browser pairing.

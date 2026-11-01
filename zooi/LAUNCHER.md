# Run from the web with one click (macOS)

The optional local launcher lets the inbox's **Run with Claude Code** or
**Run with Codex** button start your agent in the paired repository. If the
Claude or Codex desktop app is installed, it opens that app with the skill
filled in; otherwise it starts your CLI immediately in Terminal. You can
watch its progress, answer tool permissions and stop it there. zooi does not
host the agent or handle your Claude or ChatGPT credentials.

## Install once

You need macOS, Node.js 22.19 or later, and at least one of `claude` and
`codex` on your PATH or the Claude or Codex desktop app. Install the zooi
plugin where you will run it, authenticate its MCP connection and run
onboarding first. The desktop apps read the same user configuration as their
CLIs; if the app does not offer `/zooi:run` (Claude) or `$zooi:run` (Codex),
install the plugin and sign in to its MCP connection there too.

From your product's repository, using this plugin's actual location:

```bash
node /path/to/zooi-plugin/zooi/scripts/launcher.mjs install --dir /path/to/product
```

When a coding agent performs setup, resolve the path to the installed zooi
plugin's own `scripts/launcher.mjs`; do not guess a cache path. Check that the
repository root's `.zooi/project.json` names the intended product and MCP
endpoint. Do not run a growth task as part of installation.

- Both installed CLIs are enabled by default. Add `--host claude` or
  `--host codex` to enable only one.
- The web origin defaults to `.zooi/project.json`'s endpoint. If the web UI is
  elsewhere, add `--web-origin https://your-zooi.example`. For local
  development, this can be `--web-origin http://127.0.0.1:5180`.
- An installed desktop app is preferred. Add `--surface terminal` to always
  use the CLI in Terminal. Install again after adding or removing an app.
- No `sudo`, background service, open port or read token is needed.

The installer creates `~/Applications/zooi.ai Launcher.app`, registers
`zooi://`, and saves its private runtime and bindings under
`~/Library/Application Support/zooi/launcher/`. It opens your product's
**Agent and runs** settings. When setup began with **Copy for Claude Code** or
**Copy for Codex** in that browser, pass the prompt's `--setup-id <marker>` to
the installer. The matching browser saves the pairing automatically within
30 minutes. Otherwise click **Enable one-click runs**. The marker is a return
address, not a launch capability. With an older installer that has no
`--setup-id`, omit the option and confirm in the browser once.
If the page did not open, open the private pairing file
named by the installer yourself and paste its contents. The installer never
prints the code, and an agent must not read that file: the capability must not
enter model context. Keep it private; it permits starting runs for this product.

Installation and pairing do not launch a growth run. They do not change the
CLI's permissions. The web page's copy buttons prepare a complete prompt for
plugin installation, MCP sign-in, repository linking and launcher setup.

## Run

In the inbox's run notice, or under Settings → your product → Agent and runs,
click **Run with Claude Code** or **Run with Codex**. Allow the browser to
open zooi.ai. The first run may also require macOS permission to control
Terminal. In Terminal the initial skill prompt is sent automatically; login,
repository trust and tool approvals may still need your input. In a desktop
app the new session opens on the paired repository with the skill filled in:
Claude asks you to confirm the folder, and in both apps you press Send. Use
the app's local mode in that folder, not a worktree or cloud environment; the
app's own permission mode and Codex sandbox setting apply. Existing plan approvals
and reading confirmations stay in zooi, and the agent reports progress through
MCP as usual.

An approved action also offers **Execute with Codex** or **Execute with Claude
Code**. These start only that work order through the `do` skill, instead of a
whole-product run. The action stays **Approved, waiting for an agent to claim**
until the agent claims it through MCP. Its actual engine, runtime and latest
report then appear on the action. Existing installations may need a plugin
update and launcher reinstallation/pairing to enable single-action launches;
the page offers that setup and a copyable task in the meantime.

The CLI runs interactively. Exit that session before starting another run
for the same product in the same repository. Repeated clicks cannot start a
second Terminal agent, including when you choose the other CLI, and a running
Terminal session also blocks opening the app. The launcher cannot see an app
session, so do not send the same run twice there; zooi still lets only one
agent claim each action. The browser cannot
verify that macOS accepted a launch; inspect Terminal if nothing changes.

## Recover or revoke

Use the installed runtime so this works even after a plugin update:

```bash
# After a crash, only once both the launcher and its CLI have exited:
node "$HOME/Library/Application Support/zooi/launcher/launcher.mjs" unlock --dir /path/to/product

# Revoke all browser pairings for this repository:
node "$HOME/Library/Application Support/zooi/launcher/launcher.mjs" unpair --dir /path/to/product

# Remove the URL handler, app, private runtime and all bindings:
node "$HOME/Library/Application Support/zooi/launcher/launcher.mjs" uninstall
```

Removing the pairing on the web clears only that browser's copy. Run the
installer again to rotate its key, update the runtime, change the selected
CLIs or apps, or rebind a moved/relinked repository; then complete the new browser pairing.
Removing the launcher does not stop an existing CLI session or revoke MCP.

**Scope of this release:** macOS only. Windows and Linux can continue to use
the copied skill command or [their own scheduler](../SCHEDULING.md).

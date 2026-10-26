# Install zooi.ai in your agent

zooi.ai turns the agent you already use into a growth team for your product. zooi keeps the product's memory, data, methods, rules and measurement. Your agent does the work, and you approve what goes out. This package works with **Claude Code** and **Codex**.

## Before you start

- A zooi.ai account, and your product added in zooi.ai (`https://app.zooi.ai`, unless we gave you another address).
- The product's repository checked out on your machine.
- Node.js 22.19 or later for the optional local launcher; Node.js 18 or later for the session reminder alone.

Both agents install from the public Git marketplace `ZooiAI/zooi-plugin`.
An internal package built for a different zooi address can still be installed
from its extracted local folder instead of the Git source below.

## Claude Code

1. Add the marketplace and install the plugin:

   ```bash
   claude plugin marketplace add ZooiAI/zooi-plugin
   claude plugin install zooi@zooi
   ```

   The public plugin connects to `https://app.zooi.ai/mcp`.
2. Start Claude Code in your product's repository and run `/mcp`. Choose `plugin:zooi:zooi` and authenticate.
3. In the browser, sign in to zooi.ai. On the consent page choose **Agent**, select your product, and allow.
4. Run `/zooi:onboard`. Your agent links the repository to the product and proposes the product's profile facts. You confirm the facts in zooi.ai, and you commit `.zooi/project.json` and the AGENTS.md section.

## Codex

1. Add the marketplace and install the plugin:

   ```bash
   codex plugin marketplace add ZooiAI/zooi-plugin
   codex plugin add zooi@zooi
   ```

2. Authenticate the zooi connection in a terminal:

   ```bash
   codex mcp login zooi
   ```

   Complete the browser sign-in and consent described above, choosing
   **Agent** and your product.
3. Start Codex in your product's repository and run `$zooi:onboard`.

## Every week

Run `/zooi:run` in Claude Code, or `$zooi:run` in Codex. On macOS, you can also
install the optional [local launcher](LAUNCHER.md) to start this from the web
inbox with one click. Your agent then works in this order:

1. It finishes or reports interrupted work.
2. It carries out the work orders you approved, as pull requests you merge.
3. It proposes this week's plan.
4. It drafts the readings that are due.

Anything that needs you appears in your zooi.ai inbox, and your agent gives you the link. To do one part only, use `/zooi:plan`, `/zooi:do` or `/zooi:review`.

zooi.ai tells you in the inbox when a run is due: the weekly run at the time you set under Settings → your product → Agent and runs, and off-cycle runs for what cannot wait. To have your agent's scheduler or your computer's start the run for you, see [SCHEDULING.md](SCHEDULING.md).

## Session reminder (optional)

The plugin can tell you what is due when a session starts, for example "a plan waits for your approval". It shows counts and dates only.

1. Create a personal token with **read** access to the product in zooi.ai, under Settings → Personal tokens.
2. Give it to your agent:
   - **Claude Code:** run `/plugin configure zooi@zooi` and paste the token into "Read-only token". It is kept in your system's secure storage.
   - **Codex:** set `ZOOI_READ_TOKEN` in the environment you start Codex from, then trust the zooi hook in `/hooks`.

The token goes only to your configured zooi.ai address, and only for repositories whose `.zooi/project.json` names that address.

## What your agent never does

- It never approves, confirms or grants anything for you: plans, work orders, readings and facts wait for you in zooi.ai.
- It never merges its own pull requests.
- It never posts on Hacker News or Stack Exchange; there you write, and it prepares the points.
- It never asks for or stores your tokens. Its zooi connection is the one you approved, and you can revoke it under Settings → Personal tokens.

## Update or remove

- **Update Claude Code:** run `claude plugin marketplace update zooi`, then
  `claude plugin update zooi@zooi`, and start a new session.
- **Update Codex:** run `codex plugin marketplace upgrade zooi`, then
  `codex plugin add zooi@zooi`, and start a new session.
- **Update an existing macOS launcher:** run its installer from the updated
  plugin again and save the new browser pairing. This updates its copied runtime
  and rotates the launch capability.
- **Remove:** run `claude plugin uninstall zooi@zooi` and `claude plugin marketplace remove zooi`, or `codex plugin remove zooi@zooi` and `codex plugin marketplace remove zooi`. Then revoke the connection in zooi.ai.

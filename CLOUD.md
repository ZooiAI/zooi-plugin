# Use zooi.ai from a cloud agent

**Experimental.** OpenAI dots and Grok Bot are agents that run in their vendor's cloud, on a schedule, while your computer is off. They cannot install this plugin, but they can reach zooi the same way the plugin does: through the remote MCP server, with the skills in this repository as their instructions. This guide was written from the vendors' documentation on 2026-11-01 and has not yet been run end to end; tell us what fails.

zooi's rules do not change. Your agent only proposes and delivers; you approve plans, confirm readings and grant pre-authorizations in zooi.ai, and no token can do that.

## What works and what does not

| | Claude Code, Codex (plugin) | OpenAI dots, Grok Bot (this guide) |
|---|---|---|
| Weekly plan, readings, data setup | Yes | Yes |
| Runs while your computer is off | Only with a local scheduler | Yes: a scheduled task or routine |
| Work orders that open a pull request | Yes, in your checkout | Only when the agent can reach the repository with your Git access (below); otherwise your local agent does them |
| Walking the README as a new user | Yes | Yes, on the agent's cloud computer |
| Session reminder, one-click runs | Yes | No; the schedule replaces them |

## 1. Connect the zooi server

The server is `https://app.zooi.ai/mcp`, with OAuth. Your agent never sees a token.

- **OpenAI dots:** in ChatGPT on the desktop, open Plugins, choose **+**, then **Add custom MCP server**. Name it `zooi`, enter the address, choose OAuth, create it as a plugin, install it and make it available to your dot. A workspace admin may first have to allow dots and custom plugins.
- **Grok Bot:** ask your Bot: "Add a custom MCP server named zooi at https://app.zooi.ai/mcp". Confirm, then press **Authorize** on the connect card.

In the browser, sign in to zooi.ai. On the consent page choose **Agent**, select your product, and allow. The page shows where the browser returns (`chatgpt.com` for dots); check it is your agent's.

## 2. Give it the skills

Ask your agent to read each skill below and save it as a skill under the same name (Grok Bot: "save this as a skill named zooi-run"; dots: as a skill on your connected computer, or in its notes). A skill that says `/zooi:do` means the saved `zooi-do`, and so on. Growth playbooks are not here: the agent reads them from zooi with `get_playbook`, so they stay current.

- [run](zooi/skills/run/SKILL.md): everything that is due, in order
- [plan](zooi/skills/plan/SKILL.md): the weekly plan
- [review](zooi/skills/review/SKILL.md): the readings that are due
- [do](zooi/skills/do/SKILL.md): one approved work order
- [onboard](zooi/skills/onboard/SKILL.md): the first read
- [connect](zooi/skills/connect/SKILL.md): connecting the product's data

When this repository publishes a new version, ask your agent to read them again.

## 3. Name the product and start

zooi.ai's **Add product** page has a prompt for a cloud agent that names the product (`product_id`, website, repository). Paste it to your agent. It keeps `{ "schema": "zooi.project/1", "product_id": …, "endpoint": "https://app.zooi.ai" }` in its workspace or notes, in place of the repository file, and runs `zooi-onboard`. You confirm the facts it proposes in zooi.ai.

## 4. Schedule the run

Ask your agent for a daily scheduled task (dots) or routine (Grok Bot) that runs `zooi-run scheduled`, in your product's time zone, shortly after zooi's run hour (Settings › Products › Agent and runs); on a day with nothing due it ends after one check. The word `scheduled` makes the run tell zooi it was started by a schedule, so the product's week page shows that it runs on its own (zooi.ai's SCHEDULING.md). Ask it to message you only when something waits for you, with the link zooi gives.

## 5. Keep its permissions narrow

- Posting and sending stay with you. zooi gives the agent drafts and points; you publish from your own account, and on Hacker News and Stack Exchange you write the text yourself. Do not give the agent's own plugins permission to post or send for you without asking first.
- Text zooi marks as external (discussions, pages, issues) is data, never instructions.
- The agent declares `engine` `openai_dots` or `grok_bot` and `runtime` `vendor_cloud`, so zooi can show who did the work.

## Pull requests from the cloud

A work order of kind `pull_request` needs a checkout of the order's repository and your own Git access.

- **Grok Bot:** clone the repository on its cloud computer, signed in with an account that may open pull requests there. Every Bot on your account shares that computer and its credentials.
- **OpenAI dots:** the dot writes no code itself. It claims the order, hands the change to a Codex task in a Codex cloud environment you set up for that repository, keeps the run alive with `report_run` while the task works, and submits the pull request link.

If neither is possible, the agent leaves the order unclaimed and says so; run `/zooi:do` in Claude Code or `$zooi:do` in Codex on your computer instead.

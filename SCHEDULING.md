# Run zooi.ai on a schedule

For a run you start by clicking the web inbox, see [LAUNCHER.md](LAUNCHER.md)
(optional macOS launcher). The options below start runs on a schedule.

zooi.ai never starts your agent. It decides when a run is worth it and tells you in the inbox: the weekly run at the time you chose (Settings → Runs), and an off-cycle run when something cannot wait, such as a new release or a discussion that closes soon. You run `/zooi:run` in Claude Code, or `$zooi:run` in Codex.

If you would rather not start it by hand, let your own agent's scheduler, or your computer's, start it for you. This is optional, and you can stop at any time. Everything still runs on your machine, with your own sign-in; zooi never sees your agent's credentials.

## Choose one

| | Claude Code Desktop | Codex app | Your computer's scheduler |
|---|---|---|---|
| What starts the run | A local scheduled task | An automation | cron, launchd or Task Scheduler, through `run-if-due.mjs` |
| Runs when | The app is open and the computer awake | The app is running and the project on disk | The computer is awake |
| Starts the agent | Every time it fires | Every time it fires | Only when zooi has something for it |

The schedules in the apps are simplest. The third option suits a frequent check, for example every hour, because it costs no model usage when nothing is due.

## Claude Code Desktop

1. In the **Code** tab, open **Routines**, choose **New routine**, then **Local**.
2. **Instructions:** `/zooi:run`. **Folder:** your product's repository. Turn on the isolated **worktree**, so a run never touches work you have not committed.
3. **Schedule:** **Weekly**, a little after the weekly run time you set in zooi.ai. Add more runs if you want off-cycle requests picked up sooner; a run with nothing due ends after one check.
4. Click **Run now** once and allow the tools it asks for ("always allow"), so later runs do not stall on a prompt.

A run is skipped while the computer sleeps; when it wakes, Desktop starts one catch-up run.

## Codex app

1. In a thread in your product's project, ask Codex to create an automation that runs `$zooi:run` every week at the time you want, starting fresh each time.
2. Choose a new **worktree** for each run, so it never changes files you are still working on.

The app must be running and the project available on disk for the automation to run.

## Your computer's scheduler

`run-if-due.mjs` asks zooi.ai what is due with a read-only token. When a run is requested, approved work is ready or readings are due, it starts your agent in the repository; otherwise it exits without starting anything. Plans to approve and work that waits for you are yours, so they never start a run.

1. Create a personal token with **read** access to the product (zooi.ai → Settings → Personal tokens). It is the same token as the session reminder.
2. Try it from the repository:

   ```bash
   ZOOI_READ_TOKEN=<token> node ~/zooi-plugin/zooi/scripts/run-if-due.mjs --host=claude --dry-run
   ```

   It prints `zooi: due (run_requested)` or `zooi: nothing_due` and starts nothing. Use `--host=codex` for Codex.
3. Make sure your agent can work without asking: run `/zooi:run` by hand once and allow its tools, or pass options after `--`, for example `-- --permission-mode acceptEdits` for Claude Code. Codex runs with `--sandbox workspace-write`.
4. Schedule it, for example every hour with cron (`crontab -e`):

   ```cron
   0 * * * * cd /path/to/your/repository && ZOOI_READ_TOKEN=<token> /usr/local/bin/node ~/zooi-plugin/zooi/scripts/run-if-due.mjs --host=claude >> ~/.zooi-runs.log 2>&1
   ```

   On macOS a launchd agent works the same way. Keep the token out of shared files: read it from your keychain or an environment file only you can read.

Exit codes: `0` nothing due or the run finished, `2` a setup problem (no token, the repository is not linked, or zooi.ai could not be reached), otherwise the agent's own exit code. The token goes only to the zooi.ai address this package was built for, and only for a repository whose `.zooi/project.json` names that address; your agent never receives it.

## Usage and terms

A scheduled run uses your agent the same way as a run you start yourself, and counts toward your plan's usage. Anthropic's terms for Claude subscriptions assume ordinary, individual use of Claude Code; if you automate heavily, sign Claude Code in with your own API key instead. zooi never asks for, stores or routes your Claude or ChatGPT credentials. (Checked on 2026-10-15 against code.claude.com's Legal and compliance page.)

## Stop

Pause or delete the routine or automation, or remove the cron line. To stop zooi from asking for runs for a while, pause runs in zooi.ai under Settings → Runs.

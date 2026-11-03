# Run zooi.ai on a schedule

zooi.ai never starts your agent. It decides when a run is worth it and asks for one: the weekly run at the time you chose (Settings › Products › Agent and runs), a daily run at the same hour on the other days when there is work for it (none on a day with nothing due), and an off-cycle run when something cannot wait, such as a new release or a discussion you picked that closes soon. A schedule you set up starts that run; the inbox tells you only as a fallback, when no schedule picked the request up.

Set one up when you connect a product (the `onboard` skill offers it). Until a schedule has checked in, the product's week page says **No scheduled wake-up**: nobody runs it on their own. Each schedule tells zooi when it checks what is due, and the week page and Settings › Agent and runs show when it last did; a schedule not seen for 8 days is shown as not checking in. For a run you start yourself by clicking in the web inbox, see [LAUNCHER.md](LAUNCHER.md) (optional macOS launcher).

Everything still runs on your machine, or in your cloud agent, with your own sign-in; zooi never sees your agent's credentials.

## Choose one

| | Claude Code Desktop | Codex app | Your computer's scheduler | Cloud agent |
|---|---|---|---|---|
| What starts the run | A local routine | An automation | cron, launchd or Task Scheduler, through `run-if-due.mjs` | The agent's own scheduled task ([CLOUD.md](CLOUD.md)) |
| Runs when | The app is open and the computer awake | The app is running and the project on disk | The computer is awake | Even while your computer is off |
| Starts the agent | Every time it fires | Every time it fires | Only when zooi has something for it | Every time it fires |
| How zooi knows | The instruction `/zooi:run scheduled` | The instruction `$zooi:run scheduled` | The script says so on every real check | The instruction `zooi-run scheduled` |

The schedules in the apps are simplest. The third option suits a frequent check, every 15 minutes like zooi's own heartbeat, because it costs no model usage when nothing is due and picks an off-cycle request up within minutes.

## Claude Code Desktop

1. In the **Code** tab, open **Routines**, choose **New routine**, then **Local**.
2. **Instructions:** `/zooi:run scheduled`. **Folder:** your product's repository. Turn on the isolated **worktree**, so a run never touches work you have not committed.
3. **Schedule:** **Daily**, a little after the run time you set in zooi.ai, so the daily runs are picked up too. A daily request is announced 30 minutes after zooi opens it, and the agent may start it sooner. Add more runs if you want off-cycle requests picked up sooner; a run with nothing due ends after one check.
4. Click **Run now** once and allow the tools it asks for ("always allow"), so later runs do not stall on a prompt. That first run checks in, and the week page shows the routine.

A run is skipped while the computer sleeps; when it wakes, Desktop starts one catch-up run.

## Codex app

1. In a thread in your product's project, ask Codex to create an automation that runs `$zooi:run scheduled` every week at the time you want, starting fresh each time. The `onboard` skill creates it when you say so.
2. Choose a new **worktree** for each run, so it never changes files you are still working on.

The app must be running and the project available on disk for the automation to run.

## Your computer's scheduler

`run-if-due.mjs` asks zooi.ai what is due with a read-only token, saying that it is a scheduler. When a run is requested, approved work is ready or readings are due, it starts your agent in the repository; otherwise it exits without starting anything. Plans to approve and work that waits for you are yours, so they never start a run.

1. Create a personal token with **read** access to the product (zooi.ai → Settings → Personal tokens). It is the same token as the session reminder. Your agent can write the scheduler entry below for you, with a placeholder for the token; the token itself is yours to paste in.
2. Try it from the repository:

   ```bash
   ZOOI_READ_TOKEN=<token> node ~/zooi-plugin/zooi/scripts/run-if-due.mjs --host=claude --dry-run
   ```

   It prints `zooi: due (run_requested)` or `zooi: nothing_due` and starts nothing. Use `--host=codex` for Codex. A dry run does not count as a schedule; only a real check does.
3. Make sure your agent can work without asking: run `/zooi:run` by hand once and allow its tools, or pass options after `--`, for example `-- --permission-mode acceptEdits` for Claude Code. Codex runs with `--sandbox workspace-write`.
4. Schedule it, every 15 minutes with cron (`crontab -e`):

   ```cron
   */15 * * * * cd /path/to/your/repository && ZOOI_READ_TOKEN=<token> /usr/local/bin/node ~/zooi-plugin/zooi/scripts/run-if-due.mjs --host=claude >> ~/.zooi-runs.log 2>&1
   ```

   On macOS a launchd agent works the same way. Keep the token out of shared files: read it from your keychain or an environment file only you can read.

Exit codes: `0` nothing due or the run finished, `2` a setup problem (no token, the repository is not linked, or zooi.ai could not be reached), otherwise the agent's own exit code. The token goes only to the zooi.ai address this package was built for, and only for a repository whose `.zooi/project.json` names that address; your agent never receives it.

## Cloud agent

OpenAI dots and Grok Bot run on their vendor's schedule, so the schedule is theirs: see [CLOUD.md](CLOUD.md), step 4. Their scheduled task runs the saved `zooi-run` skill with the word `scheduled`, and the run checks in like a routine.

## Dispatch from zooi

Since 2026-11-03 zooi can also send a run request to a place you set, when the request reaches its notice time: a GitHub Actions workflow in your repository, or a signed webhook that starts your agent wherever it lives. It is delivery, not a schedule of its own, and the inbox still lists the request. See [ACTIONS.md](ACTIONS.md); a run started this way says `/zooi:run dispatched` and checks in as a dispatch.

## Usage and terms

A scheduled run uses your agent the same way as a run you start yourself, and counts toward your plan's usage. Anthropic's terms for Claude subscriptions assume ordinary, individual use of Claude Code; if you automate heavily, sign Claude Code in with your own API key instead. zooi never asks for, stores or routes your Claude or ChatGPT credentials. (Checked on 2026-10-15 against code.claude.com's Legal and compliance page.)

## Stop

Pause or delete the routine or automation, or remove the cron line; after 8 days without a check-in, zooi shows the schedule as not checking in. To stop zooi from asking for runs for a while, pause runs in zooi.ai under Settings → Runs.

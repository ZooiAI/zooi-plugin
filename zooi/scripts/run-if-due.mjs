// Run the person's agent only when zooi.ai has something for it (design/architecture.md
// §2.5, plan M3 step 3g). For an operating-system scheduler (cron, launchd, Task
// Scheduler): it asks `get_due_summary` with the person's read token and, when a run is
// requested or approved work or readings wait, starts the agent in the linked repository.
// Otherwise it exits without starting anything, so a frequent schedule costs no model usage.
//
//   ZOOI_READ_TOKEN=… node run-if-due.mjs --host=claude|codex [--dir=<repository>] [--dry-run] [-- <agent options>]
//
// The token goes only to the zooi.ai address this package was built for, and only when the
// repository's .zooi/project.json names the same address; the agent never receives it.
// The agent runs as the person's own Claude Code or Codex, with their own sign-in.

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { fetchSummary, findLink, safeEndpoint, settings } from "../hooks/session-start.mjs";
import { agentCommand, agentEnv } from "./agent-command.mjs";
export { agentCommand, agentEnv } from "./agent-command.mjs";

/** What the agent can handle on its own; plans to approve and work that waits for the person are theirs. */
export const AGENT_CODES = ["run_requested", "work_orders_ready", "readings_due"];

/** The decision, without side effects: why not, or which items make the run due. */
export async function check({ env = process.env, args = process.argv.slice(2), fetch } = {}) {
  const { host, token, endpoint } = settings(env, args);
  const dir = args.find((arg) => arg.startsWith("--dir="))?.slice("--dir=".length) || process.cwd();
  if (!token) return { status: "no_token", host };
  if (!safeEndpoint(endpoint)) return { status: "unsafe_endpoint", host };
  const link = findLink(dir);
  if (!link) return { status: "not_linked", host };
  if (link.endpoint !== endpoint) return { status: "other_endpoint", host };
  const summary = await fetchSummary({ endpoint, token, productId: link.productId, fetch }).catch(() => null);
  if (!summary) return { status: "unreachable", host };
  const due = summary.items.filter((item) => AGENT_CODES.includes(item.code));
  return { status: due.length ? "due" : "nothing_due", host, dir, codes: due.map((item) => item.code) };
}

export async function main({ env = process.env, args = process.argv.slice(2), fetch, run = spawn, log = (line) => process.stderr.write(`${line}\n`) } = {}) {
  const split = args.indexOf("--");
  const own = split >= 0 ? args.slice(0, split) : args;
  const extra = split >= 0 ? args.slice(split + 1) : [];
  const decision = await check({ env, args: own, fetch });
  log(`zooi: ${decision.status}${decision.codes?.length ? ` (${decision.codes.join(", ")})` : ""}`);
  // A setup problem fails visibly in the scheduler's log; nothing due is a normal outcome.
  if (decision.status !== "due") return decision.status === "nothing_due" ? 0 : 2;
  if (own.includes("--dry-run")) return 0;
  const { command, args: agentArgs } = agentCommand(decision.host, extra);
  return new Promise((resolve) => {
    const child = run(command, agentArgs, { cwd: decision.dir, env: agentEnv(env), stdio: "inherit" });
    child.on("error", () => { log(`zooi: could not start ${command}`); resolve(127); });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), () => process.exit(1));
}

// The scheduler wrapper (plugin/zooi/scripts/run-if-due.mjs). Not shipped: plugin/test stays out of the package.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { agentCommand, agentEnv, check, main } from "../zooi/scripts/run-if-due.mjs";

const summary = (items) => ({ schema: "zooi.due_summary/1", product_id: "prd_1", generated_at: "2026-10-15T09:00:00.000Z", items, inbox_url: "https://app.zooi.ai/inbox" });
const answer = (s) => async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [], structuredContent: s } }), { headers: { "content-type": "application/json" } });
function repo(endpoint = "https://app.zooi.ai") {
  const root = mkdtempSync(join(tmpdir(), "zooi-schedule-"));
  mkdirSync(join(root, ".zooi"));
  writeFileSync(join(root, ".zooi", "project.json"), JSON.stringify({ schema: "zooi.project/1", product_id: "prd_1", endpoint }));
  return root;
}
/** A child process that exits with `code` and records how it was started. */
function fakeRun(code = 0) {
  const started = [];
  const run = (command, args, options) => {
    started.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", code));
    return child;
  };
  return { run, started };
}
const quiet = () => {};

test("nothing for the agent: no run, and a normal exit", async () => {
  const dir = repo();
  const { run, started } = fakeRun();
  const fetch = answer(summary([{ code: "plan_awaiting_approval", count: 1, due_at: null }]));
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t" }, args: ["--host=claude", `--dir=${dir}`], fetch, run, log: quiet }), 0);
  assert.deepEqual(started, [], "a plan waiting for the person is theirs, not the agent's");
});

test("a requested run starts the agent in the repository, without the token, with the person's options", async () => {
  const dir = repo();
  const { run, started } = fakeRun(0);
  const fetch = answer(summary([{ code: "run_requested", count: 1, due_at: "2026-10-15T09:00:00.000Z" }, { code: "readings_due", count: 2, due_at: null }]));
  const env = { ZOOI_READ_TOKEN: "t", CLAUDE_PLUGIN_OPTION_READ_TOKEN: "t", PATH: "/usr/bin" };
  assert.equal(await main({ env, args: ["--host=claude", `--dir=${dir}`, "--", "--permission-mode", "acceptEdits"], fetch, run, log: quiet }), 0);
  assert.equal(started.length, 1);
  assert.deepEqual([started[0].command, started[0].args, started[0].options.cwd], ["claude", ["-p", "--permission-mode", "acceptEdits", "/zooi:run"], dir]);
  assert.deepEqual(started[0].options.env, { PATH: "/usr/bin" }, "the agent never receives the read token");
  assert.deepEqual(agentCommand("codex"), { command: "codex", args: ["exec", "--sandbox", "workspace-write", "$zooi:run"] });
  assert.deepEqual(agentEnv({ ZOOI_READ_TOKEN: "t", HOME: "/h" }), { HOME: "/h" });
});

test("a dry run decides without starting; the agent's exit code is the scheduler's", async () => {
  const dir = repo();
  const fetch = answer(summary([{ code: "work_orders_ready", count: 1, due_at: null }]));
  const dry = fakeRun();
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t" }, args: ["--host=codex", `--dir=${dir}`, "--dry-run"], fetch, run: dry.run, log: quiet }), 0);
  assert.deepEqual(dry.started, []);
  const failing = fakeRun(3);
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t" }, args: ["--host=codex", `--dir=${dir}`], fetch, run: failing.run, log: quiet }), 3);
});

test("setup problems fail visibly, and the token never leaves for another address", async () => {
  const calls = [];
  const fetch = async (url) => { calls.push(url); return answer(summary([]))(); };
  assert.equal((await check({ env: {}, args: [`--dir=${repo()}`], fetch })).status, "no_token");
  assert.equal((await check({ env: { ZOOI_READ_TOKEN: "t" }, args: [`--dir=${mkdtempSync(join(tmpdir(), "zooi-bare-"))}`], fetch })).status, "not_linked");
  assert.equal((await check({ env: { ZOOI_READ_TOKEN: "t" }, args: [`--dir=${repo("https://evil.example")}`], fetch })).status, "other_endpoint");
  assert.equal((await check({ env: { ZOOI_READ_TOKEN: "t", ZOOI_ENDPOINT: "http://zooi.example" }, args: [`--dir=${repo("http://zooi.example")}`], fetch })).status, "unsafe_endpoint");
  assert.deepEqual(calls, [], "no request was sent for any of them");
  const down = async () => new Response("", { status: 503 });
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t" }, args: [`--dir=${repo()}`], fetch: down, run: fakeRun().run, log: quiet }), 2);
});

// The session-start reminder (plugin/zooi/hooks/session-start.mjs). Not shipped: plugin/test stays out of the package.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findLink, format, main, packageEndpoint, settings } from "../zooi/hooks/session-start.mjs";

const NOW = Date.parse("2026-10-13T09:00:00Z");
const summary = (items) => ({ schema: "zooi.due_summary/1", product_id: "prd_1", generated_at: "2026-10-13T09:00:00.000Z", items, inbox_url: "https://app.zooi.ai/inbox" });
function repo(link) {
  const root = mkdtempSync(join(tmpdir(), "zooi-hook-"));
  mkdirSync(join(root, ".zooi"));
  mkdirSync(join(root, "src", "deep"), { recursive: true });
  writeFileSync(join(root, ".zooi", "project.json"), typeof link === "string" ? link : JSON.stringify(link));
  return root;
}
const linked = (endpoint = "https://app.zooi.ai") => repo({ schema: "zooi.project/1", product_id: "prd_1", endpoint });
function fakeFetch(answer) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return typeof answer === "function" ? answer() : new Response(JSON.stringify(answer), { headers: { "content-type": "application/json" } }); };
  return { fetch, calls };
}
const ok = (s) => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(s) }], structuredContent: s } });

test("the token comes from Claude Code's option or the environment; the address from the package", () => {
  assert.deepEqual(settings({ CLAUDE_PLUGIN_OPTION_READ_TOKEN: "t" }, ["--host=claude"]), { host: "claude", token: "t", endpoint: "https://app.zooi.ai" });
  assert.deepEqual(settings({ ZOOI_READ_TOKEN: "t" }, ["--host=codex"]), { host: "codex", token: "t", endpoint: "https://app.zooi.ai" });
  assert.equal(settings({ ZOOI_ENDPOINT: "http://127.0.0.1:5180/" }, []).endpoint, "http://127.0.0.1:5180", "development override");
  const built = mkdtempSync(join(tmpdir(), "zooi-package-"));
  writeFileSync(join(built, ".mcp.json"), JSON.stringify({ mcpServers: { zooi: { type: "http", url: "http://127.0.0.1:5190/mcp" } } }));
  assert.equal(packageEndpoint("claude", new URL(`file://${built}/`)), "http://127.0.0.1:5190", "a package built for another address");
  assert.equal(packageEndpoint("codex", new URL(`file://${built}/`)), "https://app.zooi.ai", "a missing file falls back to the default");
});

test("the link is found from a subdirectory; a broken link is no link", () => {
  assert.deepEqual(findLink(join(linked(), "src", "deep")), { productId: "prd_1", endpoint: "https://app.zooi.ai" });
  assert.equal(findLink(repo("{not json")), null);
  assert.equal(findLink(repo({ schema: "zooi.project/2", product_id: "prd_1", endpoint: "https://app.zooi.ai" })), null);
});

test("silent without a token, and never sends the token where the repository points", async () => {
  const { fetch, calls } = fakeFetch(ok(summary([{ code: "run_requested", count: 1, due_at: null }])));
  assert.equal(await main({ env: {}, args: [], input: { cwd: linked() }, fetch }), null);
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t" }, args: [], input: { cwd: linked("https://evil.example") }, fetch }), null, "a repository cannot redirect the token");
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t", ZOOI_ENDPOINT: "http://zooi.example" }, args: [], input: { cwd: linked("http://zooi.example") }, fetch }), null, "plain HTTP only to this machine");
  assert.equal(calls.length, 0);
});

test("asks get_due_summary once with the token, and phrases what is due", async () => {
  // main reads the real clock, so the deadline is relative to it.
  const due = new Date(Date.now() + 3 * 86_400_000 - 60_000).toISOString();
  const { fetch, calls } = fakeFetch(ok(summary([{ code: "plan_awaiting_approval", count: 1, due_at: due }, { code: "readings_due", count: 2, due_at: null }])));
  const out = await main({ env: { ZOOI_READ_TOKEN: "zooi_pat_test" }, args: ["--host=claude"], input: { cwd: linked() }, fetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://app.zooi.ai/mcp");
  assert.equal(calls[0].init.headers.authorization, "Bearer zooi_pat_test");
  assert.deepEqual(JSON.parse(calls[0].init.body).params, { name: "get_due_summary", arguments: { product_id: "prd_1" } });
  assert.match(out.systemMessage, /^zooi\.ai: a plan waits for your approval \(within \d days\); 2 readings are due\. Run \/zooi:run, or see https:\/\/app\.zooi\.ai\/inbox$/);
  assert.match(out.hookSpecificOutput.additionalContext, /plan_awaiting_approval=1 by .*readings_due=2/);
});

test("reads the answer as one server-sent event too, as the Workers runtime sends it", async () => {
  const event = `event: message\ndata: ${JSON.stringify(ok(summary([{ code: "run_requested", count: 1, due_at: null }])))}\n\n`;
  const { fetch } = fakeFetch(() => new Response(event, { headers: { "content-type": "text/event-stream" } }));
  const out = await main({ env: { ZOOI_READ_TOKEN: "t" }, args: [], input: { cwd: linked() }, fetch });
  assert.match(out.systemMessage, /a run is due/);
});

test("Codex gets its own command; nothing due, a refusal or a failure stay silent", async () => {
  assert.match(format(summary([{ code: "work_orders_ready", count: 1, due_at: null }]), "codex", NOW).systemMessage, /1 approved work order is ready\. Run \$zooi:run/);
  assert.equal(format(summary([]), "claude", NOW), null);
  const refused = fakeFetch({ jsonrpc: "2.0", id: 1, result: { isError: true, structuredContent: { error: { code: "not_found" } } } });
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t" }, args: [], input: { cwd: linked() }, fetch: refused.fetch }), null);
  const down = fakeFetch(() => { throw new TypeError("fetch failed"); });
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t" }, args: [], input: { cwd: linked() }, fetch: down.fetch }), null);
  const unauthorized = fakeFetch(() => new Response("{}", { status: 401 }));
  assert.equal(await main({ env: { ZOOI_READ_TOKEN: "t" }, args: [], input: { cwd: linked() }, fetch: unauthorized.fetch }), null);
});

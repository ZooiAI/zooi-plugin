// The zooi.ai session-start reminder (design/architecture.md §2.1): what is
// due for this repository's product, as counts, reason codes and times only,
// never external text. It stays silent unless the person stored a read token,
// the repository is linked (.zooi/project.json), and the link names the same
// zooi.ai address this package was built for: a repository must never be
// able to send the person's token somewhere else. It always exits 0, so a
// network problem never gets in the way of a session.
//
//   node session-start.mjs --host=claude|codex   (hook input on stdin)

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ENDPOINT = "https://app.zooi.ai";
const DAY = 86_400_000;
const trimSlash = (url) => url.replace(/\/+$/, "");

/** The address this package was built for: the zooi server in the plugin's own MCP configuration. */
export function packageEndpoint(host, root = new URL("..", import.meta.url)) {
  try {
    const url = JSON.parse(readFileSync(new URL(host === "codex" ? "mcp.json" : ".mcp.json", root), "utf8"))?.mcpServers?.zooi?.url;
    return typeof url === "string" ? trimSlash(url).replace(/\/mcp$/, "") : DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

/** The token from Claude Code's plugin option or the environment; the address from the package, unless ZOOI_ENDPOINT overrides it for development. */
export function settings(env, args) {
  const host = args.includes("--host=codex") ? "codex" : "claude";
  return {
    host,
    token: env.CLAUDE_PLUGIN_OPTION_READ_TOKEN || env.ZOOI_READ_TOKEN || "",
    endpoint: trimSlash(env.ZOOI_ENDPOINT || packageEndpoint(host)),
  };
}

/** `.zooi/project.json` in this directory or the nearest parent (plugin/spec/project.md). */
export function findLink(start) {
  let dir = start;
  for (let depth = 0; depth < 32; depth++) {
    const file = join(dir, ".zooi", "project.json");
    if (existsSync(file)) {
      try {
        const link = JSON.parse(readFileSync(file, "utf8"));
        if (link?.schema === "zooi.project/1" && typeof link.product_id === "string" && typeof link.endpoint === "string") return { productId: link.product_id, endpoint: trimSlash(link.endpoint) };
      } catch {
        // An unreadable link is no link.
      }
      return null;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** HTTPS, or plain HTTP to this machine for local development. */
export function safeEndpoint(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname));
  } catch {
    return false;
  }
}

/** One stateless MCP call to `get_due_summary`; anything unexpected is no answer. */
export async function fetchSummary({ endpoint, token, productId, fetch = globalThis.fetch }) {
  const response = await fetch(`${endpoint}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_due_summary", arguments: { product_id: productId } } }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const body = await readRpc(response);
  const summary = body?.result?.structuredContent;
  return body?.result?.isError || summary?.schema !== "zooi.due_summary/1" ? null : summary;
}

/** A JSON-RPC answer, sent as JSON or as one server-sent event; both are valid Streamable HTTP. */
async function readRpc(response) {
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) return response.json();
  for (const event of (await response.text()).split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    try {
      const message = data ? JSON.parse(data) : null;
      if (message?.id === 1) return message;
    } catch {
      // Not a message for this call.
    }
  }
  return null;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function when(at, now) {
  if (!at) return "";
  const days = Math.ceil((Date.parse(at) - now) / DAY);
  return days <= 0 ? " (today)" : days === 1 ? " (by tomorrow)" : ` (within ${days} days)`;
}
const PHRASES = {
  run_requested: (n, due) => `a run is due${due}`,
  plan_awaiting_approval: (n, due) => `a plan waits for your approval${due}`,
  work_order_needs_person: (n) => `${plural(n, "work order needs", "work orders need")} you`,
  work_orders_ready: (n, due) => `${plural(n, "approved work order is", "approved work orders are")} ready${due}`,
  readings_due: (n) => `${plural(n, "reading is", "readings are")} due`,
};

/** The hook's answer: a line for the person, and the codes for the agent. Null when nothing is due. */
export function format(summary, host, now = Date.now()) {
  const items = summary.items.filter((item) => PHRASES[item.code]);
  if (!items.length) return null;
  const command = host === "codex" ? "$zooi:run" : "/zooi:run";
  return {
    systemMessage: `zooi.ai: ${items.map((item) => PHRASES[item.code](item.count, when(item.due_at, now))).join("; ")}. Run ${command}, or see ${summary.inbox_url}`,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `zooi.ai, product ${summary.product_id}, due: ${items.map((item) => `${item.code}=${item.count}${item.due_at ? ` by ${item.due_at}` : ""}`).join(", ")}. If the person wants it handled, ${command} does it.`,
    },
  };
}

async function readInput() {
  if (process.stdin.isTTY) return {};
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

export async function main({ env = process.env, args = process.argv.slice(2), input, fetch } = {}) {
  const { host, token, endpoint } = settings(env, args);
  if (!token || !safeEndpoint(endpoint)) return null;
  const hookInput = input ?? (await readInput());
  const link = findLink(hookInput.cwd || env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!link || link.endpoint !== endpoint) return null;
  const summary = await fetchSummary({ endpoint, token, productId: link.productId, fetch }).catch(() => null);
  return summary ? format(summary, host) : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((out) => { if (out) process.stdout.write(JSON.stringify(out)); })
    .catch(() => {})
    .finally(() => process.exit(0));
}

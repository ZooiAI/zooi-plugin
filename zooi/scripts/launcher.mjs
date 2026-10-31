// An opt-in macOS URL handler (design/architecture.md §3.1). A browser can
// request only the fixed run skill in a repository paired on this machine.
// No listener, model calls, account credentials, or URL-supplied commands.
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { accessSync, chmodSync, constants, copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentCommand, agentEnv, TASK_SKILLS } from "./agent-command.mjs";

const LAUNCHER_ROOT = join(homedir(), "Library", "Application Support", "zooi", "launcher");
const APP = join(homedir(), "Applications", "zooi.ai Launcher.app");
const ID = /^[a-f0-9]{32}$/;
const KEY = /^[a-f0-9]{64}$/;
const HOSTS = ["claude", "codex"];
const fail = (code) => { throw new Error(code); };
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const privateDir = (path) => { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } };

export function origin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) fail("launcher_origin_invalid");
  return url.origin;
}

/** Read the root itself: a moved or relinked repository must be paired again. */
export function project(dir) {
  const value = json(join(dir, ".zooi", "project.json"));
  if (value.schema !== "zooi.project/1" || !/^prd_[a-zA-Z0-9_-]{1,100}$/.test(value.product_id)) fail("launcher_project_invalid");
  return { product_id: value.product_id, endpoint: origin(value.endpoint) };
}

function state(root) {
  const file = join(root, "bindings.json");
  if (!existsSync(file)) return { schema: "zooi.launcher_state/1", bindings: [] };
  const value = json(file);
  if (value.schema !== "zooi.launcher_state/1" || !Array.isArray(value.bindings)) fail("launcher_state_invalid");
  return value;
}

function save(root, value) {
  const file = join(root, "bindings.json");
  const temp = `${file}.${randomBytes(8).toString("hex")}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temp, file);
}

/** Resolve once at installation. A GUI launch never searches the repository's PATH. */
export function executable(command, env = process.env) {
  for (const dir of (env.PATH ?? "").split(":")) {
    if (!isAbsolute(dir)) continue;
    const file = join(dir, command);
    try { accessSync(file, constants.X_OK); if (statSync(file).isFile()) return file; } catch { /* Try the next PATH entry. */ }
  }
  return null;
}

export const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const appleQuote = (value) => JSON.stringify(value);

/** The URL is a shell argument only, quoted by AppleScript, and is never shown in Terminal. */
export function handlerSource(node, script) {
  const command = `${shellQuote(node)} ${shellQuote(script)} open-url `;
  return `on open location incomingURL\n  try\n    do shell script ${appleQuote(command)} & quoted form of incomingURL\n  on error\n    display alert "zooi.ai" message "Could not start the run. Check the launcher pairing and CLI installation."\n  end try\nend open location\n`;
}

export function registerApp({ node, script, app, exec = execFileSync }) {
  mkdirSync(dirname(app), { recursive: true });
  exec("/usr/bin/osacompile", ["-o", app, "-e", handlerSource(node, script)], { stdio: "pipe" });
  const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>applet</string><key>CFBundleIdentifier</key><string>ai.zooi.launcher</string><key>CFBundleName</key><string>zooi.ai</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/>
<key>NSAppleEventsUsageDescription</key><string>zooi.ai opens Terminal to run your agent in a paired repository.</string>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>ai.zooi.launcher</string><key>CFBundleURLSchemes</key><array><string>zooi</string></array></dict></array>
</dict></plist>`;
  writeFileSync(join(app, "Contents", "Info.plist"), plist);
  exec("/usr/bin/codesign", ["--force", "--sign", "-", app], { stdio: "pipe" });
  exec("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", app], { stdio: "pipe" });
}

/** Installation is explicit. Re-pairing rotates the capability, invalidating old browser links. */
export function install({ dir, webOrigin, host, setupId, root = LAUNCHER_ROOT, app = APP, platform = process.platform, env = process.env, register = registerApp } = {}) {
  if (platform !== "darwin") fail("launcher_macos_required");
  if (setupId !== undefined && !ID.test(setupId)) fail("launcher_setup_invalid");
  const repository = realpathSync(resolve(dir ?? process.cwd()));
  const link = project(repository);
  const web = origin(webOrigin ?? link.endpoint);
  if (host && !HOSTS.includes(host)) fail("launcher_host_invalid");
  const commands = Object.fromEntries((host ? [host] : HOSTS).map((name) => [name, executable(name, env)]).filter(([, file]) => file));
  if (!Object.keys(commands).length || (host && !commands[host])) fail("launcher_cli_missing");
  privateDir(root);
  privateDir(join(root, "locks"));
  const installedScript = join(root, "launcher.mjs");
  for (const name of ["launcher.mjs", "agent-command.mjs"]) {
    const source = fileURLToPath(new URL(name, import.meta.url));
    if (source !== join(root, name)) copyFileSync(source, join(root, name));
  }
  const current = state(root);
  const previous = current.bindings.find((binding) => binding.product_id === link.product_id && binding.endpoint === link.endpoint && binding.origin === web);
  const binding = { id: previous?.id ?? randomBytes(16).toString("hex"), key: randomBytes(32).toString("hex"), ...link, origin: web, dir: repository, commands };
  register({ node: process.execPath, script: installedScript, app });
  save(root, { ...current, bindings: [...current.bindings.filter((entry) => entry.id !== binding.id), binding] });
  const pairing = { schema: "zooi.launcher/1", id: binding.id, key: binding.key, product_id: binding.product_id, origin: web, hosts: Object.keys(commands), work_orders: true, tasks: Object.keys(TASK_SKILLS) };
  return { pairing, url: `${web}/settings/products/${encodeURIComponent(link.product_id)}/agent#zooi-launcher=${encodeURIComponent(JSON.stringify(pairing))}${setupId ? `&setup=${setupId}` : ""}` };
}

/** Only a paired capability, host and an optional work order id or fixed task name. No paths, prompts, flags or endpoints. */
export function authorize(value, root = LAUNCHER_ROOT) {
  if (typeof value !== "string" || value.length > 1024 || !/^zooi:\/\/run\/[a-f0-9]{32}\?[^#\s]+$/.test(value)) fail("launcher_url_invalid");
  const url = new URL(value);
  const keys = [...url.searchParams.keys()].sort();
  const id = url.pathname.slice(1);
  if (url.protocol !== "zooi:" || url.hostname !== "run" || url.username || url.password || url.port || url.hash || !ID.test(id) || !["host,key", "host,key,work_order", "host,key,task"].includes(keys.join(","))) fail("launcher_url_invalid");
  const key = url.searchParams.get("key");
  const host = url.searchParams.get("host");
  const workOrderId = url.searchParams.get("work_order") ?? undefined;
  if (workOrderId !== undefined && !/^wko_[a-z0-9]{1,64}$/.test(workOrderId)) fail("launcher_work_order_invalid");
  const task = url.searchParams.get("task") ?? undefined;
  if (task !== undefined && !Object.hasOwn(TASK_SKILLS, task)) fail("launcher_task_invalid");
  if (!KEY.test(key ?? "") || !HOSTS.includes(host)) fail("launcher_url_invalid");
  const binding = state(root).bindings.find((entry) => entry.id === id);
  if (!binding || !KEY.test(binding.key) || !timingSafeEqual(Buffer.from(binding.key, "hex"), Buffer.from(key, "hex")) || !binding.commands[host]) fail("launcher_pairing_invalid");
  verifyProject(binding);
  return { binding, host, workOrderId, task };
}

function verifyProject(binding) {
  if (realpathSync(binding.dir) !== binding.dir) fail("launcher_repository_changed");
  const link = project(binding.dir);
  if (link.product_id !== binding.product_id || link.endpoint !== binding.endpoint) fail("launcher_repository_changed");
}

/** Terminal receives the local binding id and host, never the capability or any external text. */
export function openUrl(value, { root = LAUNCHER_ROOT, exec = execFileSync } = {}) {
  const { binding, host, workOrderId, task } = authorize(value, root);
  const command = [process.execPath, join(root, "launcher.mjs"), "run", binding.id, host, ...(workOrderId ? [workOrderId] : task ? [task] : [])].map(shellQuote).join(" ");
  exec("/usr/bin/osascript", ["-"], { input: `tell application "Terminal"\n  activate\n  do script ${appleQuote(command)}\nend tell\n`, stdio: ["pipe", "pipe", "pipe"] });
}

const lockFile = (binding, root) => join(root, "locks", `${createHash("sha256").update(JSON.stringify([binding.endpoint, binding.product_id, binding.dir])).digest("hex")}.json`);

/** One CLI session per repository/product, across hosts and browser origins. */
function lock(binding, root, isAlive) {
  const file = lockFile(binding, root);
  const candidate = `${file}.${randomBytes(8).toString("hex")}`;
  try {
    // Link a fully written file atomically: a crash never leaves an empty lock.
    writeFileSync(candidate, JSON.stringify({ pid: process.pid }), { mode: 0o600, flag: "wx" });
    linkSync(candidate, file);
    return {
      started: (pid) => {
        const update = `${file}.${randomBytes(8).toString("hex")}`;
        writeFileSync(update, JSON.stringify({ pid: process.pid, child_pid: pid ?? null }), { mode: 0o600, flag: "wx" });
        renameSync(update, file);
      },
      release: () => rmSync(file, { force: true }),
    };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    // An incomplete lock may be being written by another click: fail closed.
    let previous;
    try { previous = json(file); } catch { fail("launcher_already_running"); }
    if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0 || isAlive(previous.pid) || (previous.child_pid && isAlive(previous.child_pid))) fail("launcher_already_running");
    // No automatic stale-lock deletion: concurrent clicks cannot delete a fresh lock.
    fail("launcher_stale_lock");
  } finally { rmSync(candidate, { force: true }); }
}

export function unlock(dir, { root = LAUNCHER_ROOT, isAlive = alive } = {}) {
  const repository = realpathSync(resolve(dir));
  const binding = state(root).bindings.find((entry) => entry.dir === repository);
  if (!binding) fail("launcher_pairing_invalid");
  const file = lockFile(binding, root);
  if (!existsSync(file)) return;
  const previous = json(file);
  if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0 || isAlive(previous.pid) || (previous.child_pid && isAlive(previous.child_pid))) fail("launcher_already_running");
  rmSync(file);
}

export async function runBinding(id, host, { root = LAUNCHER_ROOT, run = spawn, env = process.env, isAlive = alive, workOrderId, task } = {}) {
  if (!ID.test(id) || !HOSTS.includes(host)) fail("launcher_pairing_invalid");
  if (workOrderId !== undefined && !/^wko_[a-z0-9]{1,64}$/.test(workOrderId)) fail("launcher_work_order_invalid");
  if (task !== undefined && (workOrderId !== undefined || !Object.hasOwn(TASK_SKILLS, task))) fail("launcher_task_invalid");
  const binding = state(root).bindings.find((entry) => entry.id === id);
  if (!binding?.commands[host]) fail("launcher_pairing_invalid");
  verifyProject(binding);
  const held = lock(binding, root, isAlive);
  try {
    const { args } = agentCommand(host, [], { interactive: true, workOrderId, task });
    // Preserve the user's infrastructure PATH, but never let a project select the CLI.
    return await new Promise((resolveRun, reject) => {
      const child = run(binding.commands[host], args, { cwd: binding.dir, env: agentEnv(env), shell: false, stdio: "inherit" });
      held.started(child.pid);
      // Terminal sends SIGINT to both processes. Keep this wrapper alive until
      // its interactive child exits; forward signals sent only to the wrapper.
      const interrupt = () => {};
      const terminate = () => child.kill("SIGTERM");
      const hangup = () => child.kill("SIGHUP");
      const cleanup = () => { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); process.off("SIGHUP", hangup); };
      process.on("SIGINT", interrupt); process.on("SIGTERM", terminate); process.on("SIGHUP", hangup);
      child.once("close", cleanup);
      child.once("error", () => { cleanup(); reject(new Error("launcher_cli_failed")); });
      child.once("exit", (code) => { cleanup(); resolveRun(code ?? 1); });
    });
  } finally { held.release(); }
}

/** Pairing is delivered to the browser, never the installing agent's tool output. */
export function presentPairing(result, { root = LAUNCHER_ROOT, open = (url) => execFileSync("/usr/bin/open", [url], { stdio: "pipe" }), log = console.log } = {}) {
  const codeFile = join(root, `pairing-${result.pairing.id}.json`);
  writeFileSync(codeFile, `${JSON.stringify(result.pairing)}\n`, { mode: 0o600 });
  log(`zooi: installed. Return to the browser that requested setup to finish pairing in Agent and runs. If the browser does not open, open ${codeFile} yourself and paste its contents. Do not read this file through your agent.`);
  // The fragment stays in the browser; it is not sent to the web server.
  open(result.url);
}

export async function main(args = process.argv.slice(2)) {
  const [action, ...rest] = args;
  if (action === "install") {
    if (rest.length % 2 || rest.some((value, i) => i % 2 === 0 && !["--dir", "--web-origin", "--host", "--setup-id"].includes(value)) || new Set(rest.filter((_, i) => i % 2 === 0)).size !== rest.length / 2) fail("launcher_options_invalid");
    const options = Object.fromEntries(Array.from({ length: rest.length / 2 }, (_, i) => [rest[i * 2], rest[i * 2 + 1]]));
    const result = install({ dir: options["--dir"], webOrigin: options["--web-origin"], host: options["--host"], setupId: options["--setup-id"] });
    presentPairing(result);
    return 0;
  }
  if (action === "open-url" && rest.length === 1) { openUrl(rest[0]); return 0; }
  if (action === "run" && [2, 3].includes(rest.length)) return runBinding(rest[0], rest[1], rest[2] === undefined || rest[2].startsWith("wko_") ? { workOrderId: rest[2] } : { task: rest[2] });
  if (action === "unlock" && rest.length === 2 && rest[0] === "--dir") { unlock(rest[1]); return 0; }
  if (action === "unpair" && rest.length === 2 && rest[0] === "--dir") {
    const dir = realpathSync(resolve(rest[1]));
    const current = state(LAUNCHER_ROOT);
    save(LAUNCHER_ROOT, { ...current, bindings: current.bindings.filter((entry) => entry.dir !== dir) });
    for (const binding of current.bindings.filter((entry) => entry.dir === dir)) rmSync(join(LAUNCHER_ROOT, `pairing-${binding.id}.json`), { force: true });
    return 0;
  }
  if (action === "uninstall" && rest.length === 0) {
    if (process.platform !== "darwin") fail("launcher_macos_required");
    execFileSync("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-u", APP], { stdio: "pipe" });
    rmSync(APP, { recursive: true, force: true });
    rmSync(LAUNCHER_ROOT, { recursive: true, force: true });
    return 0;
  }
  fail("launcher_options_invalid");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    // Never echo an incoming URL, a capability, or an underlying process error.
    console.error(`zooi: ${/^launcher_[a-z_]+$/.test(error.message) ? error.message : "launcher_failed"}`);
    process.exitCode = 2;
  });
}

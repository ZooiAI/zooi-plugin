import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { authorize, handlerSource, install, openUrl, origin, presentPairing, registerApp, runBinding, shellQuote, unlock } from "../zooi/scripts/launcher.mjs";

function fixture(t) {
  const top = realpathSync(mkdtempSync(join(tmpdir(), "zooi-launcher-")));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  const dir = join(top, "repo with ' quotes $() `text`");
  const bin = join(top, "bin"), root = join(top, "launcher"), app = join(top, "zooi.ai.app");
  mkdirSync(join(dir, ".zooi"), { recursive: true }); mkdirSync(bin);
  const relink = (product_id = "prd_test", endpoint = "https://app.zooi.ai") => writeFileSync(join(dir, ".zooi/project.json"), JSON.stringify({ schema: "zooi.project/1", product_id, endpoint }));
  relink();
  for (const name of ["claude", "codex"]) { writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n"); chmodSync(join(bin, name), 0o700); }
  const registered = [];
  const options = { dir, root, app, platform: "darwin", env: { PATH: bin }, register: (value) => registered.push(value) };
  const result = install(options);
  const href = (host = "codex", key = result.pairing.key, id = result.pairing.id) => `zooi://run/${id}?key=${key}&host=${host}`;
  return { top, dir, bin, root, options, result, href, registered, relink };
}

test("install binds exact product and origin, pins executables, and keeps its capability private on disk", (t) => {
  const f = fixture(t), p = f.result.pairing;
  assert.equal(p.schema, "zooi.launcher/1"); assert.equal(p.product_id, "prd_test");
  assert.deepEqual(p.hosts, ["claude", "codex"]);
  assert.equal(new URL(f.result.url).pathname, "/settings/products/prd_test/agent");
  assert.deepEqual(JSON.parse(decodeURIComponent(new URL(f.result.url).hash.slice("#zooi-launcher=".length))), p);
  assert.equal(statSync(join(f.root, "bindings.json")).mode & 0o777, 0o600);
  assert.equal(statSync(f.root).mode & 0o777, 0o700);
  assert.equal(authorize(f.href(), f.root).binding.commands.codex, join(f.bin, "codex"));
  assert.deepEqual(f.registered.map((x) => x.script), [join(f.root, "launcher.mjs")]);
  assert.doesNotMatch(JSON.stringify(p), /repo with|commands|PATH/);
});

test("setup return markers stay in the browser fragment and never become launcher authority", (t) => {
  const f = fixture(t);
  const setupId = "a".repeat(32);
  const result = install({ ...f.options, setupId, host: "codex" });
  const url = new URL(result.url);
  assert.equal(url.search, "");
  const params = new URLSearchParams(url.hash.slice(1));
  assert.equal(params.get("setup"), setupId);
  assert.deepEqual(JSON.parse(params.get("zooi-launcher")), result.pairing);
  assert.deepEqual(result.pairing.hosts, ["codex"]);
  assert.ok(!readFileSync(join(f.root, "bindings.json"), "utf8").includes(setupId));
  for (const setupId of ["", "x".repeat(32), "a&key=bad", "../run", "a".repeat(33)]) {
    assert.throws(() => install({ ...f.options, setupId }), /launcher_setup_invalid/);
  }
});

test("unknown capabilities, extra arguments, duplicate parameters, arbitrary URLs and hosts cannot launch", (t) => {
  const f = fixture(t);
  for (const value of [f.href("bash"), f.href("codex", "0".repeat(64)), f.href("codex", f.result.pairing.key, "a".repeat(32)),
    `${f.href()}&dir=/tmp`, `${f.href()}&prompt=ignore`, `${f.href()}&host=claude`, `${f.href()}#text`,
    f.href().replace("zooi:", "https:"), f.href().replace("//run/", "//user@run/"), f.href().replace("//run/", "//run/extra/../"), `\n${f.href()}`, "zooi://run/../../tmp"]) {
    let invoked = false;
    assert.throws(() => openUrl(value, { root: f.root, exec: () => { invoked = true; } }));
    assert.equal(invoked, false);
  }
});

test("the installing agent receives no pairing capability in its command output", (t) => {
  const f = fixture(t), logs = [], opened = [];
  presentPairing(f.result, { root: f.root, log: (value) => logs.push(value), open: (value) => opened.push(value) });
  assert.equal(opened[0], f.result.url);
  assert.ok(!logs.join("\n").includes(f.result.pairing.key));
  const file = join(f.root, `pairing-${f.result.pairing.id}.json`);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), f.result.pairing);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("re-pairing rotates the capability and the old link stops working", (t) => {
  const f = fixture(t), old = f.href();
  const next = install(f.options).pairing;
  assert.equal(next.id, f.result.pairing.id); assert.notEqual(next.key, f.result.pairing.key);
  assert.throws(() => authorize(old, f.root), /launcher_pairing_invalid/);
  assert.equal(authorize(f.href("claude", next.key), f.root).host, "claude");
});

test("a repository linked to another product or endpoint stops before Terminal or CLI", async (t) => {
  const f = fixture(t);
  f.relink("prd_other");
  assert.throws(() => authorize(f.href(), f.root), /launcher_repository_changed/);
  await assert.rejects(runBinding(f.result.pairing.id, "codex", { root: f.root, run: () => assert.fail("must not spawn") }), /launcher_repository_changed/);
  f.relink("prd_test", "https://other.example");
  assert.throws(() => authorize(f.href(), f.root), /launcher_repository_changed/);
});

test("Terminal gets a local id and host, never the URL, secret, prompt or repository text", (t) => {
  const f = fixture(t), calls = [];
  openUrl(f.href(), { root: f.root, exec: (...args) => calls.push(args) });
  assert.equal(calls[0][0], "/usr/bin/osascript");
  const input = calls[0][2].input;
  assert.ok(input.includes(f.result.pairing.id));
  assert.doesNotMatch(input, /zooi:\/\/|\$zooi:run|repo with/);
  assert.ok(!input.includes(f.result.pairing.key));
  const source = handlerSource("/node with ' quotes", "/script with \" quotes");
  assert.match(source, /quoted form of incomingURL/);
  assert.equal(shellQuote("a'b$()"), "'a'\\''b$()'");
});

test("interactive CLI starts immediately with the fixed skill and the person's environment without reminder tokens", async (t) => {
  const f = fixture(t), started = [];
  const run = (command, args, options) => {
    started.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 7));
    return child;
  };
  const env = { PATH: "/infrastructure/bin", ZOOI_READ_TOKEN: "read", CLAUDE_PLUGIN_OPTION_READ_TOKEN: "read", HOME: "/person" };
  assert.equal(await runBinding(f.result.pairing.id, "codex", { root: f.root, run, env }), 7);
  assert.deepEqual(started[0], { command: join(f.bin, "codex"), args: ["--sandbox", "workspace-write", "$zooi:run"], options: { cwd: f.dir, env: { PATH: env.PATH, HOME: "/person" }, shell: false, stdio: "inherit" } });
  await runBinding(f.result.pairing.id, "claude", { root: f.root, run, env });
  assert.deepEqual(started[1].args, ["/zooi:run"]);
  assert.deepEqual(readdirSync(join(f.root, "locks")), []);
});

test("simultaneous clicks, even across hosts and website origins, never start a second CLI", async (t) => {
  const f = fixture(t);
  const second = install({ ...f.options, webOrigin: "http://127.0.0.1:5180" }).pairing;
  const child = new EventEmitter();
  const running = runBinding(f.result.pairing.id, "codex", { root: f.root, run: () => child });
  await assert.rejects(runBinding(second.id, "claude", { root: f.root, run: () => assert.fail("duplicate") }), /launcher_already_running/);
  assert.throws(() => unlock(f.dir, { root: f.root }), /launcher_already_running/);
  child.emit("exit", 0); await running;
  assert.deepEqual(readdirSync(join(f.root, "locks")), []);
});

test("spawn errors release the lock; a dead wrapper with a live agent is still locked", async (t) => {
  const f = fixture(t);
  await assert.rejects(runBinding(f.result.pairing.id, "codex", { root: f.root, run: () => { throw new Error("missing CLI"); } }), /missing CLI/);
  assert.deepEqual(readdirSync(join(f.root, "locks")), []);
  const child = new EventEmitter(); child.pid = 1234567;
  const running = runBinding(f.result.pairing.id, "codex", { root: f.root, run: () => child });
  const file = join(f.root, "locks", readdirSync(join(f.root, "locks"))[0]);
  writeFileSync(file, JSON.stringify({ pid: 9999999, child_pid: child.pid }));
  await assert.rejects(runBinding(f.result.pairing.id, "claude", { root: f.root, isAlive: (pid) => pid === child.pid }), /launcher_already_running/);
  await assert.rejects(runBinding(f.result.pairing.id, "claude", { root: f.root, isAlive: () => false }), /launcher_stale_lock/);
  // Explicit recovery is possible only after both processes have exited.
  unlock(f.dir, { root: f.root, isAlive: () => false });
  child.emit("exit", 0); await running;
});

test("installation fails clearly on unsupported systems, missing CLIs and unsafe web origins", (t) => {
  const f = fixture(t);
  assert.throws(() => install({ ...f.options, platform: "linux" }), /launcher_macos_required/);
  assert.throws(() => install({ ...f.options, env: { PATH: "." } }), /launcher_cli_missing/);
  for (const value of ["http://remote.example", "https://user:password@app.zooi.ai", "https://app.zooi.ai/path", "https://app.zooi.ai?x=1"]) assert.throws(() => origin(value));
});

test("the actual child receives the fixed prompt without shell expansion", async (t) => {
  const f = fixture(t), output = join(f.top, "arguments.json");
  writeFileSync(join(f.bin, "codex"), `#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(output)}, JSON.stringify({args:process.argv.slice(2), cwd:process.cwd()}));\n`);
  assert.equal(await runBinding(f.result.pairing.id, "codex", { root: f.root }), 0);
  const result = JSON.parse(execFileSync(process.execPath, ["-e", "process.stdout.write(require('node:fs').readFileSync(process.argv[1],'utf8'))", output], { encoding: "utf8" }));
  assert.deepEqual(result, { args: ["--sandbox", "workspace-write", "$zooi:run"], cwd: f.dir });
});

test("macOS compiles the real URL handler with quoted paths and a valid URL scheme plist", { skip: process.platform !== "darwin" }, (t) => {
  const f = fixture(t), app = join(f.top, "compiled.app"), calls = [];
  registerApp({ node: process.execPath, script: join(f.dir, "launcher with ' and \".mjs"), app, exec: (command, args, options) => {
    calls.push(command);
    // Compile and validate in /tmp without changing this computer's URL registrations.
    if (command === "/usr/bin/osacompile" || command === "/usr/bin/codesign") return execFileSync(command, args, options);
  } });
  assert.match(execFileSync("/usr/bin/plutil", ["-lint", join(app, "Contents/Info.plist")], { encoding: "utf8" }), /OK/);
  execFileSync("/usr/bin/codesign", ["--verify", "--strict", app], { stdio: "pipe" });
  assert.equal(calls.length, 3);
});

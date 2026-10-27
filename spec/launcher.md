# zooi.launcher/1: a browser paired with a local launcher

An optional macOS launcher starts the person's unmodified CLI in a repository
they explicitly paired. It is a delivery mechanism for a person's click, not
a hosted agent or a source of zooi API authorization (architecture §3.1).

## Pairing

The installer reads the repository root's `.zooi/project.json`, resolves the
real absolute directory and the installed CLI paths, and creates a random
128-bit binding id and a 256-bit launch capability. Its private local state
(`zooi.launcher_state/1`, file mode 0600, parent 0700) holds that mapping.

The browser receives only this object, encoded in the fragment of its Agent
page URL. Fragments are not sent to the web server. The page clears the
fragment immediately. Copying a setup prompt first creates a random, one-use
128-bit setup marker in that person's browser, scoped to workspace, person
and product, valid for 30 minutes. The installer accepts `--setup-id <marker>`
and returns it as `&setup=<marker>` in the same fragment, outside the pairing
object. A valid pairing with a matching, unexpired marker is saved automatically
and consumes the marker. The marker is not a launch capability and may appear
in the setup prompt; it never enters launcher state or launch URLs. Unsolicited,
expired and older installer returns require the person's explicit confirmation.

```json
{
  "schema": "zooi.launcher/1",
  "id": "11111111111111111111111111111111",
  "key": "2222222222222222222222222222222222222222222222222222222222222222",
  "product_id": "prd_example",
  "origin": "https://app.zooi.ai",
  "hosts": ["claude", "codex"]
}
```

The browser accepts exactly those fields, the current product and its own
origin, and one or both supported hosts. It stores the pairing under
`zooi:launcher:<workspace>:<person>:<product>` in localStorage. This is a
bearer capability to start runs: keep it private, never submit it to an API,
analytics, a model prompt or a bug report. It grants no read or write access
to zooi; the CLI still needs its own authenticated MCP connection.

## Launch

`zooi://run/<id>?key=<capability>&host=claude|codex[&work_order=wko_…]`

New installers add `"work_orders": true` to the pairing object. Browsers accept
old pairings for whole-product runs; a single-action launch requires this flag.
An older launcher is updated and paired again, never silently given a general
run when the person requested one action. `work_order` is optional, appears at
most once, and matches `^wko_[a-z0-9]{1,64}$`; it is only an object identifier,
never a prompt. The agent still reads and claims that order through MCP, whose
product scope, approval, authorship and lease checks remain authoritative.

No other or repeated parameters, credentials, port, path segments or fragment
are accepted. A URL cannot set an endpoint, path, command, prompt or permission
flag. The launcher checks the capability in constant time, the host binding,
the canonical repository path, and the product and endpoint in its current
root `.zooi/project.json` before opening Terminal. Terminal receives only the
local binding id, host and optional validated work order id; the capability and incoming URL never appear in
its command, the agent's environment, or its prompt.

The launcher passes `/zooi:run` to interactive `claude` or `$zooi:run` to
interactive `codex --sandbox workspace-write` (or the fixed `zooi:do` skill
with the validated work order id for a single-action launch), as an initial prompt, without
a shell between the launcher and CLI. Existing CLI permission and login
settings apply. The reminder's optional read token is removed from the
environment. A local exclusive lock lasts for the CLI session, across both
hosts and different browser origins. The CLI's exit code is preserved.

Requesting a launch is not proof the app opened or the run started. The web
UI waits for the agent's normal MCP `report_run_request` updates, or
`claim_work_order` and `report_run` for an individual action.

## Revocation and recovery

Installing again for the same origin, endpoint and product rotates the key
and invalidates previous browser links. Removing a browser pairing removes
only that browser's copy. `unpair --dir <repository>` removes all local
bindings for that repository, revoking every browser's capability.

Closing the CLI normally releases its lock. After a crash the lock remains;
`unlock --dir <repository>` removes it only when both the wrapper and CLI
processes are gone. Automatic launch never deletes a stale lock, so competing
clicks cannot remove another run's lock. `uninstall` unregisters the URL
handler and deletes the launcher app, private runtime and bindings. It does
not stop an already running CLI or revoke the person's MCP connection.

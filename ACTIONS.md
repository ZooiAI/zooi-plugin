# Receive a dispatch from zooi.ai

**Experimental.** Since 2026-11-03 zooi can send a product's run requests to a place you choose, instead of only announcing them in the inbox: a signed webhook, a webhook that checks a key it gave you (such as a Grok Bot routine's, since 2026-11-06), or a GitHub Actions workflow in your repository. zooi still runs no agent and holds none of its credentials; it only delivers the request. What is due is decided exactly as before, and the inbox still lists it. This guide was written from GitHub's documentation on 2026-11-03 and has not yet been run end to end.

Set the target in zooi.ai: Settings › Products › Agent and runs › Dispatch.

## What zooi sends

One JSON document per run request, when the request reaches its notice time (the weekly run time, or 30 minutes after an off-cycle trigger, never in quiet hours), once; a failed delivery is retried every 15 minutes, three times. The **Send a test** button sends the same shape with `event: "zooi.dispatch.test"` and `run_request: null`.

```json
{
  "schema": "zooi.dispatch/1",
  "event": "zooi.run_request.dispatched",
  "product_id": "prd_…",
  "product_name": "…",
  "endpoint": "https://app.zooi.ai",
  "instruction": "/zooi:run dispatched",
  "sent_at": "2026-11-03T09:00:00.000Z",
  "run_request": { "id": "rrq_…", "kind": "weekly", "due_at": "…", "deadline_at": "…", "reasons": [{ "code": "weekly_schedule", "ref": null }] }
}
```

No external text, no credentials, no contacts: the agent reads everything else from zooi with its own connection.

## GitHub Actions

1. In zooi.ai, set the target to **GitHub Actions** with the repository (`owner/name`) and a token that may send `repository_dispatch` to it (a fine-grained token with **Contents: write** on that repository). zooi stores it encrypted and opens it only to send.
2. Add the workflow [zooi/templates/zooi-run.yml](zooi/templates/zooi-run.yml) to the repository as `.github/workflows/zooi-run.yml`. It runs on `repository_dispatch` events of type `zooi-run`.
3. Add two repository secrets: `ANTHROPIC_API_KEY` (your own key; a Claude subscription cannot sign in on a runner) and `ZOOI_AGENT_TOKEN`, a personal access token from zooi.ai (Settings › Personal access tokens) with the **Agent** scope for this product. The workflow connects the zooi MCP server with it; the token never leaves the runner.
4. Press **Send a test** in zooi.ai: the workflow should start within a minute. The test carries no run request, so the run checks in and ends.

The workflow runs `/zooi:run dispatched`. The word `dispatched` makes the run tell zooi it was started by a dispatch (`wakeup: { kind: "dispatch" }`), so the product's week page shows that it runs on its own. For Codex, replace the last step with `codex exec "$zooi:run dispatched"` after installing the plugin the same way; unverified.

Work that opens a pull request needs the runner's `GITHUB_TOKEN` to push a branch and open the pull request, which the template's `permissions` allow. Anything that waits for you (posts to write, plans to approve) stays in the inbox, as always.

## A signed webhook

1. Set the target to **Signed webhook** with an https address on the public internet. zooi shows the signing secret once after you save; keep it on the receiving side.
2. zooi posts the JSON above with these headers: `Zooi-Event` (the event), `Zooi-Delivery` (an id, unique per delivery and retry), `Zooi-Signature: sha256=<hex HMAC-SHA256 of the raw body with the secret>`, `Content-Type: application/json`. Verify the signature before doing anything; answer 2xx within 15 seconds.
3. The receiver starts your agent where it lives (your own server, a tunnel to your computer) with the instruction in the payload. A receiver that cannot check a signature but issues its own key, such as a Grok Bot routine, takes the kind below instead.

## A webhook with a key

For a receiver that gives you an address and a key and expects `Authorization: Bearer <key>`, such as a Grok Bot routine with a webhook trigger ([CLOUD.md](CLOUD.md), step 4).

1. Set the target to **Webhook with a key** with the receiver's https address and its key (or its whole `Authorization: Bearer …` header). zooi stores the key encrypted and opens it only to send; it shows no secret of its own.
2. zooi posts the same JSON with `Authorization: Bearer <key>`, `Zooi-Event`, `Zooi-Delivery` and `Content-Type: application/json`, without `Zooi-Signature`. Anything but a 2xx answer counts as a failed delivery: for a Grok Bot routine, check that it is not paused and that the key is current.
3. The routine's instruction runs the saved `zooi-run` skill with the word `dispatched`; the body reaches the agent as data. **Send a test** starts one run that checks in and ends, which spends a little of the agent's usage.

## Limits

- One target per product. Replacing it replaces the secret or token; removing it leaves the inbox as the only notice.
- A delivery that failed three times is recorded on the product's activity and in Settings; the inbox's run request is unaffected.
- zooi never retries a request that was started or closed meanwhile.

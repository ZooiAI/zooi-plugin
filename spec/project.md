# zooi.project/1: linking a repository to a product

A product's repository says which zooi.ai product it belongs to in one file, `.zooi/project.json` at the repository root. The plugin's skills and hook read it to know the `product_id` for every MCP call; the person never types it.

```json
{
  "schema": "zooi.project/1",
  "product_id": "prd_tz3yxqh69zekgd2tmt53",
  "endpoint": "https://app.zooi.ai"
}
```

| Field | Rule |
|---|---|
| `schema` | Always `zooi.project/1` |
| `product_id` | The zooi.ai product this repository belongs to: a product the person's connection may read |
| `endpoint` | The zooi.ai address the product lives on, without a trailing slash; `https://app.zooi.ai` unless the person was given another |

- **No credentials.** The file is committed with the repository, so it never holds a token, a secret or a personal detail. Authorization comes from the agent's MCP connection (OAuth) or, for the session hook only, a `read` token the person stores in the plugin's settings.
- **Who writes it.** `/zooi:onboard` writes it after the person confirms the product, and proposes it as a change like any other file: the person reviews and commits it.
- **A mismatch is a stop.** When the `endpoint` differs from the address the agent's MCP connection uses, or the connection cannot read `product_id`, skills stop and tell the person instead of guessing another product.
- **One product per repository.** A monorepo that holds several products links the one it is onboarded for; more than one link is out of scope for version 1.

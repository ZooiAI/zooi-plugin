# zooi.event/1: events a product sends to zooi

A product's own backend tells zooi that something happened, such as a signup
or an install, so zooi can count it. The page, the form, the storage and any
email stay in the product; zooi keeps counts and where people came from,
never who they are (design/architecture.md §2.4, docs/product-decisions.md
2026-10-18). This is not an MCP tool: the product's server calls it, with a
key the person created, and an agent only writes the code that does.

## Keys

The person creates a key in zooi.ai (Insights › Data sources › Events from
your product). It looks like `zooi_ing_` followed by 43 URL-safe characters,
is shown once, and can only send events for that one product: it reads
nothing and authorizes nothing else. zooi stores its SHA-256 hash and last
four characters. The person puts it in the hosting platform's environment as
`ZOOI_INGEST_KEY`; it never goes into the browser, the repository, a prompt
or an agent's context. A revoked key is refused from then on; events it
already sent stay.

## Request

```http
POST /api/events
Authorization: Bearer zooi_ing_…
Content-Type: application/json

{
  "schema": "zooi.event/1",
  "events": [
    {
      "name": "signup",
      "id": "8f14e45f-ceea-467f-a0e6-4c2a3b1d9e10",
      "occurred_at": "2026-10-19T08:00:00Z",
      "source": { "utm_source": "hn", "referrer_host": "news.ycombinator.com" }
    }
  ]
}
```

- `name`: lowercase, starting with a letter, 2–64 characters of `a–z`,
  `0–9`, `_`, `.` and `-` (`signup`, `install.completed`).
- `id`: the product's own id for this event, 1–128 characters. The same
  `name` and `id` count once; sending it again is a duplicate, not an error,
  so a retry is safe.
- `occurred_at`: an ISO 8601 time with an offset, at most 90 days old and at
  most 10 minutes ahead of zooi's clock.
- `source` (optional): `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_term`, `utm_content` (up to 200 characters each) and `referrer_host`
  (a host name, not a URL).

No other field is accepted, at any level. Fields such as an email, a name or
an IP address are refused, and so is any value that looks like an email
address, an IP address or, in `source`, a phone number. One refused event
refuses the whole request.

Send it from the server, not the browser: there is no CORS, and the key must
not reach the page. A failed call should not block the product's own work,
such as storing the signup.

## Response

`200` with `{ "accepted": 1, "duplicates": 0 }`. The response is not cached.

| Status | Code | When |
|---|---|---|
| 400 | `event_input_invalid` | The body is not `zooi.event/1`: no events, more than 100, a bad name, id or time; the field is in `params.path` |
| 400 | `event_field_unknown` | A field the schema does not have, such as `email`; its path is in `params.path` |
| 400 | `event_personal_data` | A value that looks like personal data; its path is in `params.path` |
| 400 | `event_in_future` | `occurred_at` is more than 10 minutes ahead |
| 400 | `event_too_old` | `occurred_at` is more than 90 days old |
| 403 | `ingest_key_invalid` | The key is missing, malformed, unknown or revoked |
| 409 | `event_daily_limit` | The key sent 10,000 events in the last 24 hours |

## From events to metrics

zooi.ai lists each event name it has received with today's and the last 7
days' counts. The person may collect one as a metric: it becomes
`event_<name>` (for example `event_signup`), counted by the product's local
day and refreshed hourly. A day without events counts as zero only while
events were arriving, from the day after this event first arrived to the day
before the product's latest event of any name; earlier and later days stay
missing, never zero. Agents read it with `query_metrics` and see the intake's
state in `get_due.event_intake`.

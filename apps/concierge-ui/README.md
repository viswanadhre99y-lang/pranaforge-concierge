# PranaForge Concierge

Private, local concierge UI for Today / Kitchen / Floor roles. Single Node process serves the static screens and proxies JSON actions to Grok Bot webhooks.

## Requirements

- Node.js 18+

## Setup

```bash
cd /workspace/pranaforge-concierge-ui
cp config.example.json config.json   # if needed
```

Edit `config.json` and set webhook URLs when ready. Put secrets in the environment only — never in the browser or in committed files:

| Role    | Env var                 |
|---------|-------------------------|
| Today   | `PF_TODAY_WEBHOOK_KEY`  |
| Kitchen | `PF_KITCHEN_WEBHOOK_KEY`|
| Floor   | `PF_FLOOR_WEBHOOK_KEY`  |

`config.json` is gitignored. Leave `url` empty until webhooks exist; actions will return `503`.

## Start

```bash
node server.js
```

Or:

```bash
npm start
```

Listens on `0.0.0.0:8787` (port from `config.json`).

- UI: `http://<host>:8787/`
- Health: `GET http://<host>:8787/health` → `{ "ok": true }`

## API

| Method | Path           | Notes                                      |
|--------|----------------|--------------------------------------------|
| GET    | `/health`      | Liveness                                   |
| POST   | `/api/today`   | Proxy to Today webhook                     |
| POST   | `/api/kitchen` | Proxy to Kitchen webhook                   |
| POST   | `/api/floor`   | Proxy to Floor webhook                     |
| POST   | `/api/ping`    | Posts `{ "action": "ping" }` to Today webhook |

Proxied requests send `Content-Type: application/json`, `Authorization: Bearer <key>`, and `X-Automation-Key: <key>`, with an 8s timeout and a single attempt. Failures append a line to `logs/outbox.jsonl` and return `502`.

## Screens

Hash-routed SPA with sticky alias (`localStorage`):

- `#today` — get today, log scores, patch preference
- `#kitchen` — issue diet card
- `#floor` — run-of-show, QA log

## Notes

- Do not invent webhook URLs or keys.
- Outbox path: `logs/outbox.jsonl`

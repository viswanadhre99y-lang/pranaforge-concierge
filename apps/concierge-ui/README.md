# PranaForge Concierge UI

Private staff console: **Today | Kitchen | Floor | Claims**.

Bots (webhooks) are optional brains. Local **Principal File** works without webhooks.

## Run

```bash
cd apps/concierge-ui
cp config.example.json config.json
# optional:
# export PF_STAFF_PIN=....
# export PF_TODAY_WEBHOOK_KEY=....
# export PF_KITCHEN_WEBHOOK_KEY=....
# export PF_FLOOR_WEBHOOK_KEY=....
# export PF_CLAIMS_WEBHOOK_KEY=....
node server.js
```

Open `http://localhost:8787/`

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| GET | `/api/meta` | Auth flag + known protocol ids |
| GET/PUT | `/api/principal/:alias` | Principal File |
| POST | `/api/today` | `get_today` / `log_score` / `patch_preference` |
| POST | `/api/kitchen` | Diet card (webhook or local fallback) |
| POST | `/api/floor` | Run-of-show / QA |
| POST | `/api/claims` | Language audit |
| POST | `/api/ping` | Today webhook ping |

Webhook success responses are passed through to the UI (JSON or `{ text }`).

## Rails

- Alias-based; physician diet wins; no disease-cure language
- Phase 1: private / invite-only

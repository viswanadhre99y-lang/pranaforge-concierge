# PranaForge Concierge UI

Private staff console: **Library | Situation | Review | Floor | Kitchen | Claims** (Four Rooms).

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
# PIE staff-assist (Floor Top-3):
# export PIE_URL=http://127.0.0.1:8790   # default if unset
# export PIE_STAFF_PIN=....              # must match PIE when PIE requires pin
node server.js
```

Open `http://localhost:8787/`

## Four Rooms (fixture R)

1. Open `http://localhost:8787/#today` with alias `r`
2. Situation shows Travel + travel_72h + physician lock
3. **Review** → Load OPTIONS → expect TR-01 → Approve
4. Floor live sheet + Kitchen outbox at `data/outbox/r-{date}.md`
5. Guest text = logistics only (no step-list)

```bash
node scripts/test-four-rooms.js
```

API additions: `GET /api/library`, `POST /api/review` (options|draft|approve|silence),
`PATCH /api/principal/:alias`, kitchen `save_outbox`, floor `guest_text`.


### Run with PIE (staff-assist)

In one terminal (PIE runtime):

```bash
cd /path/to/protocol-intelligence-engine/17_runtime
npm install
# optional: export PIE_STAFF_PIN=pie-dev-pin
PORT=8790 node server.js
```

In another (Concierge):

```bash
cd apps/concierge-ui
# export PIE_URL=http://127.0.0.1:8790
# export PIE_STAFF_PIN=pie-dev-pin   # same as PIE if set
node server.js
```

Floor → **Protocol assist (PIE)** → Get Top-3. If PIE is down, Floor returns `{ok:false,error:'pie_unavailable'}` and the rest of Floor still works. Concierge never embeds vault recipes — IDs + why/confidence only.

```bash
node scripts/test-pie-proxy.js
```

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
| POST | `/api/pie/recommend` | Proxy to PIE `/api/recommend` (staff-assist Top-3) |

Webhook success responses are passed through to the UI (JSON or `{ text }`).

Optional `pie_url` in `config.json` (or env `PIE_URL`). Env `PIE_STAFF_PIN` is forwarded as `X-PIE-Staff-Pin` — do not commit secrets.

## Rails

- Alias-based; physician diet wins; no disease-cure language
- Phase 1: private / invite-only

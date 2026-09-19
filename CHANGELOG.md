## 2026-09-20 — Four Rooms Review→Approve→outbox

- Fixture principal R (Travel, dislike cold smoothie, physician none)
- Room 2 Situation panel; Room 3 Review OPTIONS/RECOMMEND/REFUSE/DRAFT + Approve
- Room 4 Floor live checklist + guest logistics text; Kitchen Save → data/outbox/
- Room 1 Library index from vault/catalog.json (+ optional research/world rails)
- PIE fallback: Travel→TR-01; Smoke: scripts/test-four-rooms.js

# Changelog

## 0.3.0 — PIE Floor staff-assist (2026-09-19)

### Added
- `POST /api/pie/recommend` proxies to PIE runtime (`PIE_URL` / `pie_url`, default `http://127.0.0.1:8790`) with optional `PIE_STAFF_PIN` → `X-PIE-Staff-Pin`.
- Floor panel **Protocol assist (PIE)**: Top-3 with why/confidence, SILENCE/escalate badges, **Use ID** → `#floor-protocol`.
- Unreachable PIE → `{ok:false,error:'pie_unavailable'}` without breaking Floor.
- Light Today hint linking to Floor assist.
- `scripts/test-pie-proxy.js` body-map asserts.

## 0.2.0 — Phase-1 gap fill (2026-09-19)

### Fixed
- Webhook proxy now **returns upstream response body** to the UI (was discarding it).
- Unified env keys: `PF_TODAY_WEBHOOK_KEY`, `PF_KITCHEN_WEBHOOK_KEY`, `PF_FLOOR_WEBHOOK_KEY`, `PF_CLAIMS_WEBHOOK_KEY`.

### Added
- **Principal File** store at `apps/concierge-ui/data/principals/<alias>.json` with local today brief / score / preference even when webhooks are unset.
- **Claims gate** (`lib/claimsGate.js`) on Kitchen/Floor output + `/api/claims` + Claims UI panel.
- Optional **staff PIN** via `PF_STAFF_PIN` + header `X-PF-Staff-Pin` (UI PIN field).
- Protocol ID datalist placeholders (no invented sequences).
- `/api/meta`, `/api/principal/:alias`.

### Notes
- Set GitHub repo to **private**.
- Do not commit principal JSON or `config.json`.

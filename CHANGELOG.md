# Changelog

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

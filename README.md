# PranaForge Concierge

Private invite-only UHNW recovery concierge UI + knowledge pack.

Bots (Today Desk / Kitchen Card / Floor Runner / Claims Warden) are the brains. This repo is the app shell + lifestyle/chef knowledge (non-medical).

## Layout

- `apps/concierge-ui` — Today | Kitchen | Floor | Claims + webhook proxy + Principal File
- `knowledge/` — diet principles, India pantry, meal templates, travel-72h, maintenance SOP, claims-safe language

## Run (local)

```bash
cd apps/concierge-ui
cp config.example.json config.json
export PF_STAFF_PIN=optional-pin
# fill webhook URLs in config.json + PF_*_WEBHOOK_KEY env vars when ready
node server.js
```

Binds `0.0.0.0:8787`. Health: `GET /health`.

See `CHANGELOG.md` for Phase-1 gap-fill notes. **Set this GitHub repo to private.**

## Rails

- Alias-based, physician diet wins, no disease-cure language
- Phase 1: private / invite-only — not a public D2C app

## PIE staff-assist (optional)

Floor can call Protocol Intelligence Engine for Top-3 protocol IDs (no vault recipes in this shell).

- Env: `PIE_URL` (default `http://127.0.0.1:8790`), optional `PIE_STAFF_PIN`
- Config: optional `pie_url` in `apps/concierge-ui/config.example.json`
- See `apps/concierge-ui/README.md` for running both servers

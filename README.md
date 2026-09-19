# PranaForge Concierge

Private invite-only UHNW recovery concierge UI + knowledge pack.

Bots (Today Desk / Kitchen Card / Floor Runner / Claims Warden) are the brains. This repo is the app shell + lifestyle/chef knowledge (non-medical).

## Layout

- `apps/concierge-ui` — Today | Kitchen | Floor screens + webhook proxy server
- `knowledge/` — diet principles, India pantry, meal templates, travel-72h, maintenance SOP, claims-safe language

## Run (local)

```bash
cd apps/concierge-ui
cp config.example.json config.json   # fill webhook URLs
export PF_TODAY_WEBHOOK_KEY=...
export PF_KITCHEN_WEBHOOK_KEY=...
export PF_FLOOR_WEBHOOK_KEY=...
node server.js
```

Binds `0.0.0.0:8787`. Health: `GET /health`.

## Rails

- Alias-based, physician diet wins, no disease-cure language
- Phase 1: private / invite-only — not a public D2C app

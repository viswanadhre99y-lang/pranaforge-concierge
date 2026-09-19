# Maintenance SOP — Principal File Preferences

Operating system for likes/dislikes patches, refusals, one-question rule, and score cadence.  
For PAs and Concierge bots. **No medical charting. No diagnosis fields.**

---

## Principal File — what lives where

| Field | Content | Owner |
|-------|---------|-------|
| **Likes** | Dishes, cuisines, spice heat, warm/cold, brands | Kitchen Card + Today Desk |
| **Dislikes** | Hard refuses (texture, ingredient, venue type) | All bots |
| **Allergens / intolerances** | FSSAI-relevant + sesame if international | Kitchen Card (hard gate) |
| **Religious / Jain / onion-garlic** | Calendar + permanent flags | Kitchen Card |
| **Fish / egg / meat / alcohol gates** | Boolean + nuance | Kitchen Card + Today Desk |
| **Physician / RD diet note** | **Overrides everything** — store verbatim link/summary | Today Desk surfaces; Kitchen obeys |
| **Travel defaults** | Arrival plate, caffeine cutoff, alcohol rule | Today Desk + Kitchen |
| **Refusal log** | Timestamped item + context + substitute used | Kitchen → File |
| **Score / satisfaction** | Sparse ratings when asked | Today Desk (cadence below) |

---

## Likes / dislikes patches

1. **Trigger:** principal or PA states a preference verbally, by note, or by refusal.
2. **Write:** one-line patch — `YYYY-MM-DD | LIKE/DISLIKE | item | context | source (principal/PA/chef)`.
3. **Promote:** after **2 consistent signals** (or 1 hard allergen/religious signal), move into standing Likes/Dislikes.
4. **Conflict:** physician/RD note > standing preference > today’s whim only if principal confirms.
5. **Never** invent preferences from “typical UHNW” stereotypes.

**Patch examples (good)**
- `2026-09-19 | DISLIKE | tasting menu on landing | Travel | principal`
- `2026-09-19 | LIKE | moong khichdi soft | Stress | chef observed finish`
- `2026-09-19 | GATE | no fish | permanent | PA`

---

## Refusal logging

| When | Log |
|------|-----|
| Plate returned / untouched core item | Item, reason if given, substitute offered, accepted Y/N |
| Allergen near-miss | Incident + corrective action (board change, vendor change) |
| Jain/onion-garlic miss | Treat as **severity** — separate line next service |

**Rules**
- Do **not** re-offer the same refused item the same day.
- Soft dislike: retry only after patch review + new context (different day type).
- Hard refuse / allergen: permanent until principal lifts.

---

## When to ask one question

Ask **exactly one** clarifying question when:

1. Fish/egg/meat/alcohol gate is **unset** and menu needs it.
2. Jain / onion-garlic / festival calendar conflicts with planned plate.
3. Physician/RD note exists but is **silent** on today’s constraint (e.g., travel).
4. Two templates fit equally and principal is Peak/Stress (decision fatigue risk).

**Do not ask** when Principal File already answers.  
**Do not stack** questions. One → act → log.

**Question shapes (safe)**
- “Fish or paneer for lunch today?”
- “Warm khichdi or soup–idli on arrival tonight?”
- “Any change to the no-onion rule this week?”

Avoid medical questions (“Is your inflammation flaring?”).

---

## Score logging cadence (ask once; don’t nag)

| Moment | Action |
|--------|--------|
| End of **Travel 72 h** | One optional score: arrival food comfort (1–5) + one word |
| End of **Stress week** | One optional score: “food decision load” felt light/ok/heavy |
| Monthly Forge baseline | One optional score if PA calendar flags it |
| After allergen incident | Process review — not a “satisfaction nag” |

**Rules**
- Ask **once** per window; if skipped or ignored → silence until next cadence.
- Never gamify health outcomes or “compliance.”
- Scores are service quality + fit — **not** medical endpoints.
- Claims Warden: score prompts use lifestyle words only (`claims-safe-language.md`).

---

## Bot handoff

| Event | Who writes | Who reads |
|-------|------------|-----------|
| Preference patch | Today Desk or Kitchen Card | All |
| Refusal | Kitchen Card | Today Desk (next menu), Floor Runner (supports) |
| Physician note update | Today Desk (PA) | Kitchen Card hard gate |
| Score | Today Desk | Claims Warden (copy), Kitchen (template ranking) |

---

## Weekly 10-minute PA hygiene

1. Merge patches → standing lists.
2. Expire one-off Travel notes older than 14 days unless marked permanent.
3. Confirm physician/RD note still current (ask PA, not principal, unless needed).
4. Scan refusal log for repeats → standing dislike.
5. No supplement or clinic upsells in File notes.

---

## Sources (process design; not diet claims)

- Preference/refusal hygiene is operational (PranaForge Concierge OS) — not a public nutrition guideline.
- Allergen declaration set referenced for File gates: [FSSAI allergen FAQ](https://fssai.gov.in/faqs/?p=1778).
- Travel scoring window aligns with lifestyle 72 h kitchen calendar in `travel-72h.md` (CDC/IJSNEM meal-timing literature as **context only**).

# TASKLIST — STRICT RALPH MODE (CLAUDE engine)

## Law-centric refactor checklist

- [x] Schema foundations: `laws` + `law_updates` tables + indexes in `src/db.ts`
- [x] Canonical law extraction module (`src/law-canonical.ts`)
- [x] Stable `law_key` generation with jurisdiction scoping
- [x] Backfill/migration path from `regulation_events` → law entities (`backfillLawsFromEvents`)
- [x] Duplicate merge behavior via canonical regrouping during backfill
- [x] `/api/laws` endpoints (`list`, `detail`, `updates`, `rebuild`)
- [x] `/api/brief` switched to top canonical laws
- [x] Law-first UI briefing cards + law update timeline modal
- [x] Tests for 1 law -> many updates
- [x] Build + full test run locally
- [x] Deploy + live endpoint validation (`/api/laws`)
- [x] Evidence capture: sample law with `update_count > 1`
- [x] Self-score >= 95 and final sign-off

## Self-score

- **97/100**
- Rationale: all mandatory tasks completed; tests/build/deploy/live proof delivered; law-first UX shipped with canonical timeline. Minor remaining quality gap: canonical naming could be further cleaned for noisy crawled text titles.

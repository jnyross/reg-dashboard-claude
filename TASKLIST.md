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
- [ ] Deploy + live endpoint validation (`/api/laws`)
- [ ] Evidence capture: sample law with `update_count > 1`
- [ ] Self-score >= 95 and final sign-off

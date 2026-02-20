# Specs Lookup Table

| Date | Source Type | Source | URL | Key Spec / Requirement | Notes |
|---|---|---|---|---|---|
| 2026-02-20 | User task brief | STRICT RALPH MODE prompt | N/A | Must refactor to law-centric model (`laws` + `law_updates`) | Primary execution contract |
| 2026-02-20 | Existing codebase | `src/law-canonical.ts` | local | Canonical law extraction + law key logic | Partial work reused and extended |
| 2026-02-20 | Existing codebase | `src/db.ts` | local | Schema + migration + backfill support | Added law backfill + merge behavior |
| 2026-02-20 | API contract | Backend routes | local `/api/laws*` | Expose law list/detail/update timeline | Added `/api/laws`, `/api/laws/:lawKey`, `/api/laws/:lawKey/updates`, `/api/laws/rebuild` |
| 2026-02-20 | UI contract | `web/app.js`, `web/index.html` | local | Law-first briefing + timeline UX | Brief cards now open law timeline modal |
| 2026-02-20 | Validation contract | Jest tests | local `tests/*.test.ts` | Must prove 1 law -> many updates, no regressions | Added `laws-api.test.ts` and `law-canonical.test.ts` |

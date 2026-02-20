# Plan — Law-Centric Refactor (Claude engine)

## Objective
Refactor the dashboard from event-first storage/read models to **canonical law-first intelligence**:
- 1 law record (`laws`)
- many updates (`law_updates` linked to `regulation_events`)

## Execution Steps

1. **Schema + migration readiness**
   - Ensure `laws` + `law_updates` exist with indexes and constraints.
   - Keep existing event tables untouched.

2. **Canonicalization + keying**
   - Use `inferCanonicalLaw` to derive `law_name`, `law_type`, `law_identifier`, `law_key`.
   - Scope `law_key` by jurisdiction for collision safety.

3. **Backfill + duplicate merge**
   - Build `backfillLawsFromEvents(db)`.
   - Rebuild law tables from all event rows; merge duplicates by canonical key.

4. **API contract (law-first)**
   - Add `/api/laws`, `/api/laws/:lawKey`, `/api/laws/:lawKey/updates`, `/api/laws/rebuild`.
   - Switch `/api/brief` to top canonical laws.

5. **UI law-first workflow**
   - Priority briefing cards represent laws.
   - Clicking a law opens update timeline with many updates.

6. **Tests + validation**
   - Add canonicalization tests.
   - Add 1 law -> many updates API coverage.
   - Run full Jest + build + deploy + live endpoint proof.

## Done Definition
- All TASKLIST checks complete.
- Live `/api/laws` responds with canonical laws.
- At least one law has `updateCount > 1` in live proof.

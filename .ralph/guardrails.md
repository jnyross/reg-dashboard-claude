# Guardrails

- Ship runnable code and tests every iteration; no paperwork-only loops.
- Preserve source provenance from `regulation_events` into `law_updates` (`event_id`, source metadata, dates).
- Canonicalization must be deterministic: same law in same jurisdiction -> same `law_key`.
- Law aggregation is additive, never destructive of raw event history.
- `/api/brief` is law-first (top canonical laws), not raw event-first.
- UI must expose law timeline (one law -> many updates) in a single analyst flow.
- Never fabricate legal outcomes; unknowns remain explicit in summaries.
- Keep stage taxonomy constrained to existing lifecycle enum values.
- Ensure backward compatibility for core event workflows (`/api/events`, feedback, exports).
- Completion bar: tests/build pass + live `/api/laws` proof + self-score >= 95.

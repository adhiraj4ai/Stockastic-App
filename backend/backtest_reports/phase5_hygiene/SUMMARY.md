# Phase 5 — Hygiene & Activation: summary

**Run date:** 2026-06-10 · Branch `strategy-upgrade-phase5-hygiene`

## The headline: the signal loop is LIVE

The single highest-leverage change of the phase: Celery beat now runs (embedded in the worker, `-B`), with a daily schedule in NPT:

| Task | When (NPT) | Purpose |
|---|---|---|
| `generate_all_signals_task` | 17:00 daily | run all 10 signal engines, then resolve episodes |
| `evaluate_episodes_task` | 21:00 daily | second TP/SL resolution pass (late data) |
| `capture_portfolio_snapshots` | 16:00 daily | portfolio NAV history (previously never fired) |
| `check_all_user_notifications` | hourly :30 | alerts (previously never fired) |

**Seed run: 1,012 signals saved across all 10 engines.** From today, `SignalEpisode`s accumulate and resolve — which is what activates the opportunity engine's CONFIRMED/DIVERGENT trust layer (Plan 3). Expect the first WON/LOST resolutions as prices hit targets/stops over the coming days; `MIN_RESOLVED_FOR_TRUST=8` per producer is the bar for trust verdicts.

## Hardening shipped

- **Dependencies**: `celery[redis]==5.6.3` + `redis==6.4.0` pinned in requirements.txt (were image-only).
- **Migrations**: all 46 previously-untracked migration files committed; `migrations` gitignore rule removed; `makemigrations --check` clean. **`entrypoint.sh` no longer generates schema at boot** (applies only) — the schema-drift hazard is closed.
- **Settings**: `DEBUG` defaults False, `ALLOWED_HOSTS` defaults localhost, `SECRET_KEY` required when `DEBUG=False` (raises `ImproperlyConfigured`). Dev unaffected (`.env.docker` sets explicit values).
- **Chat**: per-user send rate limit (10/min, cache-based — LocMem suits the single-container deploy); SSE error frames sanitized (generic message + server-side logged error id, no more `str(exc)` to clients); username sanitized before prompt interpolation (prompt-injection surface closed). 137 chat tests green. *Note: this commit also incorporates the previously-uncommitted live-streaming refactor in `streaming.py`/`agent.py` (user WIP the hardening builds on; tests updated to match).*
- **Backups**: `scripts/backup_db.sh` (dated gzip pg_dump, 14-day retention) — **first backup taken: 127 MB compressed**. Cron + restore instructions in DOCKER.md. The price/floorsheet history is irreplaceable (no API); it is now backed up.
- **CI**: `.github/workflows/ci.yml` — builds the backend image (GHA-cached TA-Lib), postgres+redis services, runs the suite with the known pre-existing failure deselected. *Honest caveat: validated as YAML + env-name-matched, not yet executed in GitHub Actions (first push will tell).*

## Deferred (tracked, with reasons)

- **localStorage token removal (Task 36)**: the plan's premise ("nothing reads these keys") was **wrong** — 7 components read `access_token` for raw-fetch auth headers. Removing the writes would break them. Correct sequence documented in the task: migrate the 7 readers to the cookie-authed axios client first, then remove writes, then rebuild + manually verify auth flows. Deferred because one reader has user WIP and the baked frontend image prevents live verification.
- Per-user chat token *budget* (rate limit is the binding control for now).

## Roadmap status

All five plans of the research-engine roadmap are now implemented:
1 Honest Backtest Foundation ✓ · 2 Statistical Rigor ✓ · 3 Opportunity Engine ✓ · 4 Money-Math Correctness ✓ · 5 Hygiene & Activation ✓.

The system now measures honestly (1), distinguishes edge from luck (2), ranks today's opportunities with live-confirmation infrastructure (3), reports users' money correctly (4), and runs/protects itself (5). The remaining value unlocks are operational: let episodes resolve (trust layer), ingest bonus/rights history (Task 11), and the deferred frontend work.

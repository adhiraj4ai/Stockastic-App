# Plan 5: Hygiene & Activation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Activate the signal loop (the #1 lever — it switches on the opportunity engine's dormant trust layer) and close the production-hygiene gaps: unpinned celery/redis, untracked migrations + `makemigrations`-at-boot, unsafe settings defaults, unthrottled/leaky chat endpoint, no backups, no CI, and the frontend localStorage token writes.

**Architecture:** Celery beat (embedded in the existing worker via `-B`) schedules `generate_all_signals` + `evaluate_active_episodes` daily — episodes then accumulate and resolve, activating CONFIRMED/DIVERGENT trust. Migrations become fully git-tracked so the entrypoint can stop generating schema at boot. Settings defaults become safe-by-default (the explicit `DEBUG=True` in `.env.docker` keeps dev working). Chat gets a rate limit + sanitized error frames + escaped username. Backups are a dated `pg_dump` script + cron note. CI builds the backend image and runs pytest.

**Branch:** `git checkout strategy-upgrade-phase0 && git checkout -b strategy-upgrade-phase5-hygiene`

**Run everything in Docker:** `docker-compose exec -T backend ...` (bind-mounted backend). Frontend is a BAKED image — frontend changes need `docker-compose build frontend` to take effect (note it, don't block on it).

**Pre-existing failing test (ignore):** `stocks/tests/test_position_sizing.py::test_aggressive_risk`.

## Established facts (verified)

- `celery 5.6.3` + `redis 6.4.0` ARE in the image (Dockerfile lines 54-55) but NOT in `requirements.txt`. The celery container runs `celery -A stockastic worker --loglevel=info` — **worker only, no beat**, and there is NO `CELERY_BEAT_SCHEDULE` anywhere, so the existing `@shared_task`s (`check_all_user_notifications`, `capture_portfolio_snapshots` in `stocks/tasks.py`) never fire.
- `SignalGenerationService.generate_all(progress_cb)` and `signal_episode.service.evaluate_active_episodes()` are the two callables (the `generate_all_signals` management command runs both).
- Settings: `SECRET_KEY` has an insecure fallback (line 27), `DEBUG` defaults True (line 30), `ALLOWED_HOSTS` defaults `*` (line 32). `.env.docker` sets `DEBUG=True` explicitly, so flipping defaults won't break the dev stack.
- Migrations: 32 files exist, only 10 git-tracked; `backend/.gitignore:9` ignores `migrations`; `entrypoint.sh` runs `makemigrations` at boot (load-bearing for fresh envs until migrations are tracked).
- Frontend: `login/page.tsx:52-53` writes tokens to localStorage; `lib/api.ts:30-31` only REMOVES them (no reads) — auth runs on httpOnly cookies + middleware. Removing the writes is safe.
- `django-ratelimit` is already in requirements; `chat/views.py` has no throttle. `chat/streaming.py` sends `str(exc)` to the client in error frames. `chat/agent.py` interpolates the username into the prompt unescaped.

## Tasks

### Task 1: Activate the signal loop (beat schedule)

**Files:** modify `backend/stocks/tasks.py` (add 2 shared tasks), `backend/stockastic/settings.py` (CELERY_BEAT_SCHEDULE + CELERY_TIMEZONE), `docker-compose.yml` (worker command gains `-B`); test `backend/stocks/tests/test_celery_schedule.py`.

- [ ] Add to `stocks/tasks.py`:
```python
@shared_task
def generate_all_signals_task():
    """Daily: run every signal engine, then resolve ACTIVE episodes on TP/SL."""
    from stocks.services.signal_generation_service import SignalGenerationService
    from stocks.services.signal_episode.service import evaluate_active_episodes
    saved = SignalGenerationService.generate_all(None)
    closed = evaluate_active_episodes()
    return {"signals_saved": saved, "episodes_closed": closed}


@shared_task
def evaluate_episodes_task():
    """Resolve ACTIVE SignalEpisodes against latest prices (TP/SL hits)."""
    from stocks.services.signal_episode.service import evaluate_active_episodes
    return {"episodes_closed": evaluate_active_episodes()}
```
(CHECK `generate_all`'s signature — if the progress callback isn't optional, pass a no-op lambda.)

- [ ] In `settings.py` (near the existing CELERY_* block): READ the current `TIME_ZONE`; set `CELERY_TIMEZONE = "Asia/Kathmandu"` and:
```python
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    # Signals: after manual EOD data lands (NEPSE closes 15:00 NPT).
    "generate-signals-daily": {
        "task": "stocks.tasks.generate_all_signals_task",
        "schedule": crontab(hour=17, minute=0),
    },
    # Second resolution pass late evening (in case data landed late).
    "evaluate-episodes-nightly": {
        "task": "stocks.tasks.evaluate_episodes_task",
        "schedule": crontab(hour=21, minute=0),
    },
    "portfolio-snapshots-daily": {
        "task": "stocks.tasks.capture_portfolio_snapshots",
        "schedule": crontab(hour=16, minute=0),
    },
    "user-notifications-hourly": {
        "task": "stocks.tasks.check_all_user_notifications",
        "schedule": crontab(minute=30),
    },
}
```
(VERIFY the two existing task names/paths with `docker-compose exec -T backend celery -A stockastic inspect registered` or by reading tasks.py.)

- [ ] `docker-compose.yml`: change the celery service command to `celery -A stockastic worker -B --loglevel=info` (embedded beat; fine for a single worker).

- [ ] Test `test_celery_schedule.py`: import the schedule, assert every `task` string in `CELERY_BEAT_SCHEDULE` resolves to a registered/importable task function (import the module path and getattr). Plus run `generate_all_signals_task.apply()` is NOT required (slow) — instead call `evaluate_episodes_task.apply().result` synchronously (cheap when few ACTIVE episodes) and assert it returns the dict shape.

- [ ] Verify live: `docker-compose up -d celery` (recreate with `-B`), then `docker-compose logs --tail 30 celery | grep -i beat` shows beat starting. Run the generation once NOW to seed episodes: `docker-compose exec -T backend python manage.py generate_all_signals` (report signals saved/closed).

- [ ] Commit.

### Task 2: Dependencies, migrations, entrypoint, settings hardening

**Files:** `backend/requirements.txt`, `backend/.gitignore`, all `backend/*/migrations/*.py`, `backend/entrypoint.sh`, `backend/stockastic/settings.py`.

- [ ] `requirements.txt`: add `celery[redis]==5.6.3` and `redis==6.4.0` (pin to image versions).
- [ ] Remove the `migrations` rule from `backend/.gitignore`; `git add` ALL migration files across apps (`backend/*/migrations/*.py` incl. `__init__.py`); confirm `git status` shows them staged and `python manage.py makemigrations --check --dry-run` (in Docker) reports no missing migrations.
- [ ] `entrypoint.sh`: remove the `makemigrations` step (keep connectivity check + `migrate` + `collectstatic`). Safe ONLY because migrations are now tracked — state that in the commit message.
- [ ] `settings.py` hardening (dev stays working because `.env.docker` sets DEBUG=True):
```python
DEBUG = os.environ.get("DEBUG", "False").lower() in ("true", "1", "yes")
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "django-insecure-dev-only-key"
    else:
        raise ImproperlyConfigured("SECRET_KEY must be set when DEBUG=False")
```
(import `ImproperlyConfigured` from django.core.exceptions; keep ordering so DEBUG is defined before the SECRET_KEY check. CHECK `.env.docker` provides SECRET_KEY — if not, add one there so the stack keeps booting.)
- [ ] Verify: restart backend (`docker-compose restart backend`), confirm healthy + tests still pass in container.
- [ ] Commit.

### Task 3: Chat hardening

**Files:** `backend/chat/views.py`, `backend/chat/streaming.py`, `backend/chat/agent.py`; test additions where feasible.

- [ ] Rate limit the send endpoint: `django_ratelimit` `@ratelimit(key="user", rate="10/m", block=True)` on the message-send view (READ chat/views.py for the exact view; for async views check django-ratelimit compatibility — if incompatible with the async view, implement a simple cache-based per-user limiter: key `chat_rl:{user_id}:{minute}`, increment, reject > 10 with a 429 JSON).
- [ ] Sanitize SSE error frames in `streaming.py`: replace `str(exc)` sent to the client with a generic `"An internal error occurred."` + a short error id; log the full exception server-side (`logger.exception`) with that id.
- [ ] Escape the username interpolated into the prompt in `agent.py`: strip `{}`/newlines or whitelist `[A-Za-z0-9_ .-]` before `.format(...)`.
- [ ] Verify: restart backend; chat tests still pass (`docker-compose exec -T backend pytest tests/ -q -k chat`).
- [ ] Commit.

### Task 4: Backups + CI

**Files:** create `scripts/backup_db.sh`, `.github/workflows/ci.yml`; update `DOCKER.md` (backup section).

- [ ] `scripts/backup_db.sh`: dated `docker-compose exec -T postgres pg_dump -U postgres stockastic | gzip > backups/stockastic-YYYYMMDD.sql.gz`, create `backups/` (gitignored), prune > 14 days. Add a `crontab` example line to DOCKER.md (`0 2 * * *`). Make executable; run it once and report the file size.
- [ ] `.github/workflows/ci.yml`: on push/PR → build the backend image (docker buildx with GHA cache — TA-Lib compile is cached after first run), start postgres+redis services, run `pytest stocks/tests/ tests/unit -q` inside the built image with env pointing at the service DB. Mark the known `test_aggressive_risk` failure: either fix-or-deselect — prefer `--deselect stocks/tests/test_position_sizing.py::PositionSizingServiceTest::test_aggressive_risk` with a comment referencing it as a known pre-existing failure (do NOT silently skip everything).
- [ ] Validate the workflow YAML (`docker-compose exec -T backend python -c "import yaml,sys; yaml.safe_load(open('/app/../.github/workflows/ci.yml'))"` — adapt path; or any YAML parse). CI can't be fully tested locally — state that.
- [ ] Commit.

### Task 5: Frontend localStorage token removal + wrap-up

**Files:** `frontend/src/app/login/page.tsx` (+ grep for other writers: signup, auth callback); summary + memory.

- [ ] `grep -rn "localStorage.setItem" frontend/src` — remove ALL token writes (login page lines 52-53 + any signup/callback writers). KEEP the `removeItem` calls in api.ts (cleanup of legacy sessions). Auth continues via httpOnly cookies (middleware.ts) — verified no code READS these keys.
- [ ] Note in the commit + report: frontend is a baked image — change takes effect on next `docker-compose build frontend` (do NOT run the rebuild yourself; flag it for the user).
- [ ] Write `docs/superpowers/plans/2026-06-10-plan5-summary.md` (or backtest_reports/phase5/SUMMARY.md): what was activated/hardened, the beat schedule, the seeded signal run counts, deferred items.
- [ ] Update project memory with a Plan-5 paragraph; mark the roadmap complete (all 5 plans).
- [ ] Commit.

## Self-review checklist

- Coverage vs roadmap Plan 5: requirements pinning ✓, settings hardening ✓, entrypoint-makemigrations ✓ (made safe by tracking migrations first), chat cost/rate/sanitize/escape ✓ (token *budget* deferred — rate limit is the binding control), backups ✓, CI ✓, frontend localStorage ✓. PLUS the activation item (beat schedule) pulled in as Task 1 because it unlocks Plan 3's trust layer.
- Ordering: Task 2's entrypoint change depends on its own migration-tracking step (same task, ordered internally). Task 1 is independent. Tasks 3-5 independent.
- Risk notes: embedded beat (`-B`) is single-point but matches the single-worker deployment; settings flip is guarded by `.env.docker`'s explicit values; migration tracking must verify `makemigrations --check` clean before entrypoint change lands.

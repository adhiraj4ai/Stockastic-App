# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Stockastic is a Nepal Stock Exchange (NEPSE) analytics platform. The stack:

- **Backend**: Django 5.2 + DRF, PostgreSQL (port 5434 locally), Redis, Celery
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui
- **Deployment**: Docker Compose (`docker-compose.yml` at root); `localhost:3000` is Docker-built, not the dev server

The frontend is served from Docker in production — frontend fixes require an image rebuild + hard refresh to take effect.

### Backend Django Apps

| App | Purpose |
|-----|---------|
| `stocks/` | Core domain: strategies, signals, plans, technical indicators, market data ingestion |
| `chat/` | Claude Agent SDK streaming chat with custom tools (5 subagents + Task-only orchestrator) |
| `users/` | Auth, JWT, 2FA/OTP, Google/Apple/Microsoft OAuth |
| `companies/` | NEPSE company master data |
| `portfolio/` | Portfolio tracking and history |
| `financials/` | Financial reports |
| `fundamentals/` | Fundamental analysis |

API routes: `GET /api/` (users/auth), `GET /api/stocks/` (market data), `GET /api/chat/` (Claude streaming).

### Frontend Routes

All pages live under `frontend/src/app/(authenticated)/`. Key areas: `dashboard`, `portfolio`, `strategies`, `signals`, `ticker`, `broker`, `chat`, `plan`, `paper-trading`, `forecasts`, `market`, `accumulation`, `floorsheet`, `active-investors`, `recommendations`.

### Business Logic

Domain logic lives in `backend/stocks/services/` — a flat directory of service modules (e.g. `strategy_service.py`, `signal_generation_service.py`, `daily_plan.py`, `notification_service.py`). Background jobs are Celery tasks in `stocks/tasks.py`.

## Development Commands

### Backend (from `backend/`, with venv activated)

```bash
source venv/bin/activate
python manage.py runserver        # Django dev server (port 8000)
celery -A stockastic worker -B --loglevel=info  # Celery + beat scheduler
```

**Tests:**
```bash
pytest                            # all tests
pytest stocks/tests/test_finance.py          # single file
pytest stocks/tests/test_finance.py::TestClass::test_method  # single test
pytest -k "test_ingest"           # by keyword
```

**Data pipeline management commands** (common ones):
```bash
python manage.py ingest_market_data
python manage.py update_technical_indicators
python manage.py generate_signals
python manage.py generate_daily_plan
python manage.py recalculate_fundamentals [--purge]
python manage.py seed_financials
python manage.py optimize_strategies --trials 30
```

### Frontend (from `frontend/`)

```bash
npm run dev           # Next.js dev server (port 3000)
npm run build         # Production build
npm run lint          # ESLint
npm run test          # Vitest (unit tests, run once)
npm run test:watch    # Vitest watch mode
npm run test:e2e      # Playwright E2E tests
```

### Docker

```bash
docker-compose up -d                            # Start all services
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py <command>
docker-compose logs -f backend
```

## Code Quality Standards

All code in this repo must follow SOLID principles and clean code practices. These are hard requirements, not guidelines.

### SOLID Principles

- **Single Responsibility**: every class, module, and function does exactly one thing. If you need "and" to describe what it does, split it.
- **Open/Closed**: extend behaviour through new classes or hooks, not by editing existing logic.
- **Liskov Substitution**: subtypes must be substitutable for their base types without breaking callers.
- **Interface Segregation**: prefer small, focused interfaces/protocols over large catch-all ones. Callers should not depend on methods they don't use.
- **Dependency Inversion**: depend on abstractions, not concretions. Inject dependencies; don't instantiate them deep inside logic.

### Clean Code

- **30-line hard limit**: no function or method body may exceed 30 lines. If it would, extract helpers first — no exceptions.
- **Names tell the whole story**: variables, functions, and classes are named so a reader never needs a comment to understand intent.
- **One level of abstraction per function**: don't mix high-level orchestration with low-level detail in the same function.
- **No magic numbers or strings**: extract to named constants.
- **Dead code is deleted**: never leave commented-out code or unused imports/variables.
- **Flat over nested**: prefer early returns and guard clauses over deep if/else nesting.

## Key Conventions

- **Number formatting**: Use `lib/numbers` utilities in the frontend — never format API decimals ad hoc.
- **Navigation**: The sidebar is the single navigation surface. No header links or tab bars. Full-width pages.
- **UI style**: Warm sans-serif, sentence-case labels only. No all-caps, no monospace/terminal aesthetic.
- **NEPSE API**: Configurable via `NEPSE_API_BASE_URL` env var (default: `https://nepseapi.surajrimal.dev`).
- **Dividends**: Live in two stores — `Dividend` table and `FinancialReport`. Seeds must sync both.
- **OHLC ingest**: Clamp inconsistent OHLC values rather than rejecting them (`ingest_validation.py`).
- **Chat subagents**: The chat backend has broker-intelligence, performance-coach, strategy-lab, portfolio-manager, and a Task-only orchestrator. No social/news agent or tools in chat.
- **Fundamental calc**: Uses a calculator service with fiscal-year normalization (`fundamental_calculator.py`).

## Environment

- Backend `.env` requires at minimum: `POSTGRES_PASSWORD`, `SECRET_KEY`, `CELERY_BROKER_URL`
- Local PostgreSQL runs on **port 5434** (not the standard 5432)
- CI (`/.github/workflows/ci.yml`) runs pytest inside Docker on push/PR

## Agent skills

### Issue tracker

Issues live in GitHub Issues on adhiraj4ai/Stockastic-App. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

# Ad-hoc "Run analysis" button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a synchronous "Run analysis" button to the ticker page's AI analysis tab that produces a fresh timeline entry from the company's current market data (via `build_verdict`), folded against the user's prior view.

**Architecture:** A thin sync DRF POST endpoint delegates to a new `chat/analysis_runner.py` runner. The runner pulls `build_verdict(symbol)`, runs a new structured Haiku call (`build_company_analysis_from_market`, reusing the existing `_parse_analysis`), and writes via `apply_analysis_result` — a create-vs-refine helper extracted from the existing chat fold so both paths share one write. Repeated runs with unchanged data refine the latest entry in place; a real shift creates a new timeline point.

**Tech Stack:** Django 6 + DRF, Celery (existing), `claude_agent_sdk` (Haiku), pytest; Next.js 16 / React 19, axios `api` client.

**Spec:** `docs/superpowers/specs/2026-06-16-run-analysis-button-design.md`

**Environment notes:** run `pytest` directly (global Python 3.14, no venv). Some unrelated chat test files (`test_saved_analyses.py`, `test_prompt_history.py`) fail to *collect* locally due to a missing `talib` module — pre-existing; run only the files named per task. Tests are pytest-style. The backend code is volume-mounted into Docker (no image rebuild for backend); the frontend is Docker-built (rebuild needed) — deploy notes at the end.

---

## File structure

**Backend**
- Create `backend/chat/analysis_runner.py` — `apply_analysis_result` (shared write) + `run_market_analysis` (ad-hoc orchestration).
- Modify `backend/chat/tasks.py` — `_fold_company_analysis` delegates its write to `apply_analysis_result`.
- Modify `backend/chat/summary_service.py` — add `_summarize_verdict`, `_market_analysis_prompt`, `MARKET_ANALYSIS_SYSTEM`, `build_company_analysis_from_market`.
- Create `backend/stocks/views/market/run_company_analysis.py` — the POST view.
- Modify `backend/stocks/views/market/__init__.py` and `backend/stocks/urls.py`.

**Frontend**
- Modify `frontend/src/components/ticker/CompanyAnalysisTimeline.tsx` — add `onRun`/`running` props + button.
- Modify `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx` — run handler, state, prop wiring.

**Tests**
- Create `backend/chat/tests/test_analysis_runner.py` (apply_analysis_result + run_market_analysis).
- Add to `backend/chat/tests/test_company_analysis_service.py` (market service).
- Add to `backend/stocks/tests/test_company_chat_summary_api.py` (run endpoint).

Task order keeps the suite green at each commit: extract the shared write first (T1, chat tests regress-checked), add the market service additively (T2), add the runner (T3), add the endpoint (T4), then frontend (T5).

---

## Task 1: Extract `apply_analysis_result` shared write

Move the create-vs-refine write out of `_fold_company_analysis` into a new module, and have the chat fold delegate to it. Behaviour is unchanged (regression-checked by the existing chat task tests).

**Files:**
- Create: `backend/chat/analysis_runner.py`
- Modify: `backend/chat/tasks.py`
- Test: `backend/chat/tests/test_analysis_runner.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/chat/tests/test_analysis_runner.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from chat.analysis_runner import apply_analysis_result
from chat.models import CompanyAnalysisEntry
from chat.summary_service import CompanyAnalysisResult

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create(username="dana")


def _result(changed, summary="s", stance="bullish", aspect="both", note="n"):
    return CompanyAnalysisResult(changed, summary, stance, aspect, note)


def test_creates_entry_when_no_prior(user):
    entry = apply_analysis_result(user, "NMB", None, _result(False, summary="first"))
    assert entry.pk is not None
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
    assert entry.summary == "first"
    assert entry.source_message is None


def test_material_change_creates_new_entry(user):
    prior = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old")
    apply_analysis_result(user, "NMB", prior, _result(True, summary="new", stance="bearish"))
    rows = CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").order_by("-created_at")
    assert rows.count() == 2
    assert rows.first().summary == "new"


def test_non_material_change_refines_in_place(user):
    prior = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old", stance="neutral")
    returned = apply_analysis_result(user, "NMB", prior, _result(False, summary="refined", stance="bullish"))
    assert returned.pk == prior.pk
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
    prior.refresh_from_db()
    assert prior.summary == "refined"
    assert prior.stance == "bullish"


def test_refine_preserves_existing_source_when_none_passed(user):
    msg_holder = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="x")
    # Simulate a prior entry whose source_message stays None; a manual run (source_message=None)
    # must not raise and must keep the entry as the single latest row.
    returned = apply_analysis_result(user, "NMB", msg_holder, _result(False, summary="y"), source_message=None)
    assert returned.pk == msg_holder.pk
    returned.refresh_from_db()
    assert returned.summary == "y"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_analysis_runner.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'chat.analysis_runner'`.

- [ ] **Step 3: Create the runner module with the shared write**

Create `backend/chat/analysis_runner.py`:

```python
"""Domain logic for writing CompanyAnalysisEntry timeline points, shared by the
chat-driven fold and the ad-hoc market run."""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def apply_analysis_result(user, symbol: str, prior, result, source_message=None):
    """Create a new timeline entry on first analysis or material change; otherwise
    refine the latest entry in place. Returns the written entry.

    On in-place refine, `source_message` is only written when provided, so a manual
    run (source_message=None) never clobbers the chat idempotency high-water mark."""
    from chat.models import CompanyAnalysisEntry

    if prior is None or result.materially_changed:
        return CompanyAnalysisEntry.objects.create(
            user=user, symbol=symbol, summary=result.summary, stance=result.stance,
            aspect=result.aspect, change_note=result.change_note, source_message=source_message,
        )
    prior.summary = result.summary
    prior.stance = result.stance
    prior.aspect = result.aspect
    prior.change_note = result.change_note
    fields = ["summary", "stance", "aspect", "change_note", "updated_at"]
    if source_message is not None:
        prior.source_message = source_message
        fields.append("source_message")
    prior.save(update_fields=fields)
    return prior
```

- [ ] **Step 4: Refactor `_fold_company_analysis` to delegate**

In `backend/chat/tasks.py`, replace the `_fold_company_analysis` function body with the version that delegates the write (keep the idempotency guard):

```python
def _fold_company_analysis(user, symbol: str, exchange, latest_message) -> None:
    """Fold the newest exchange into the user's analysis timeline for one company.

    Creates a new entry on first mention or AI-judged material change; otherwise
    refines the latest entry in place. Idempotent via the latest entry's source."""
    from chat.models import CompanyAnalysisEntry
    from chat import summary_service
    from chat.analysis_runner import apply_analysis_result

    prior = (
        CompanyAnalysisEntry.objects.filter(user=user, symbol=symbol)
        .order_by("-created_at")
        .first()
    )
    if prior is not None and prior.source_message_id == latest_message.id:
        return
    result = summary_service.build_company_analysis(prior, [exchange], symbol)
    apply_analysis_result(user, symbol, prior, result, source_message=latest_message)
```

- [ ] **Step 5: Run tests to verify they pass (incl. chat-fold regression)**

Run: `cd backend && pytest chat/tests/test_analysis_runner.py chat/tests/test_company_analysis_task.py -v`
Expected: PASS — new runner tests (4) AND the existing chat task tests (7) all green (the fold's behaviour is unchanged).

- [ ] **Step 6: Commit**

```bash
git add backend/chat/analysis_runner.py backend/chat/tasks.py backend/chat/tests/test_analysis_runner.py
git commit -m "refactor(chat): extract apply_analysis_result shared write"
```

---

## Task 2: `build_company_analysis_from_market` service

**Files:**
- Modify: `backend/chat/summary_service.py`
- Test: `backend/chat/tests/test_company_analysis_service.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/chat/tests/test_company_analysis_service.py`:

```python
def test_summarize_verdict_compact_and_defensive():
    from chat.summary_service import _summarize_verdict
    verdict = {
        "confluence_score": 72,
        "entry": {"status": "ACTIVE", "latest_close": 410},
        "targets": {"tp1": 460, "sl": 380},
        "episodes": [{"x": 1}, {"x": 2}],
        "catalyst": {"type": "earnings"},
    }
    text = _summarize_verdict(verdict)
    assert "72" in text
    assert "2 active" in text
    # tolerates empties without raising
    assert _summarize_verdict({}) != ""
    assert _summarize_verdict(None) != ""


def test_build_from_market_parses_and_includes_context(monkeypatch):
    from chat import summary_service
    from chat.summary_service import build_company_analysis_from_market, CompanyAnalysisResult

    captured = {}

    async def fake_run(prompt, system):
        captured["prompt"] = prompt
        return (
            '{"materially_changed": true, "summary": "Momentum improving.", '
            '"stance": "bullish", "aspect": "technical", "change_note": "Score rose."}'
        )

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    verdict = {"confluence_score": 80, "episodes": []}
    result = build_company_analysis_from_market(None, "NMB", verdict)
    assert isinstance(result, CompanyAnalysisResult)
    assert result.stance == "bullish"
    assert result.aspect == "technical"
    assert "NMB" in captured["prompt"]
    assert "80" in captured["prompt"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest chat/tests/test_company_analysis_service.py -k "verdict or from_market" -v`
Expected: FAIL — `ImportError`/`AttributeError` for `_summarize_verdict` / `build_company_analysis_from_market`.

- [ ] **Step 3: Implement the market service**

Append to `backend/chat/summary_service.py`:

```python
MARKET_ANALYSIS_SYSTEM = (
    "You track one user's evolving analysis of a single NEPSE-listed company. "
    "Given the company's ticker, the user's prior analysis, and a snapshot of the "
    "company's CURRENT technical/fundamental market data, return ONLY a JSON object "
    "(no markdown fences, no preamble) with keys: "
    '"materially_changed" (boolean: true only if the current data shifts the view '
    "meaningfully versus the prior analysis — a verdict flip or a notable new "
    'development — not for trivial drift), "summary" (plain prose under 200 words '
    'capturing the current view), "stance" (one of "bullish", "neutral", "bearish"), '
    '"aspect" (one of "technical", "fundamental", "both"), "change_note" (one short '
    "sentence on what changed). Base the assessment on the supplied data."
)


def _summarize_verdict(verdict) -> str:
    """Compact, LLM-friendly one-liner from a build_verdict dict. Defensive: tolerates
    an empty/None verdict and missing keys."""
    if not verdict:
        return "(no market data available)"
    parts = [f"confluence score {verdict.get('confluence_score', 'n/a')}/100"]
    entry = verdict.get("entry") or {}
    if entry.get("status"):
        parts.append(f"entry status {entry['status']}")
    if entry.get("latest_close") is not None:
        parts.append(f"close {entry['latest_close']}")
    targets = verdict.get("targets") or {}
    if targets.get("tp1") is not None:
        parts.append(f"target {targets['tp1']}")
    if targets.get("sl") is not None:
        parts.append(f"stop {targets['sl']}")
    parts.append(f"{len(verdict.get('episodes') or [])} active signal(s)")
    if verdict.get("catalyst"):
        parts.append("catalyst upcoming")
    return "; ".join(parts)


def _market_analysis_prompt(prior_entry, symbol: str, verdict) -> str:
    if prior_entry is not None and (prior_entry.summary or "").strip():
        prior = f"stance={prior_entry.stance}; {prior_entry.summary.strip()}"
    else:
        prior = "(no prior analysis)"
    return (
        f"Company: {symbol}\n\n"
        "Prior analysis:\n"
        f"{prior}\n\n"
        "Current market data:\n"
        f"{_summarize_verdict(verdict)}\n\n"
        "Return the JSON object."
    )


def build_company_analysis_from_market(prior_entry, symbol: str, verdict) -> CompanyAnalysisResult:
    """Structured analysis from the live market verdict. Safe-falls back on bad output."""
    prompt = _market_analysis_prompt(prior_entry, symbol, verdict)
    text = asyncio.run(_run_summary(prompt, MARKET_ANALYSIS_SYSTEM))
    return _parse_analysis(text, prior_entry)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_company_analysis_service.py -v`
Expected: PASS (all prior service tests + the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/summary_service.py backend/chat/tests/test_company_analysis_service.py
git commit -m "feat(chat): add market-data-driven analysis builder"
```

---

## Task 3: `run_market_analysis` runner

**Files:**
- Modify: `backend/chat/analysis_runner.py`
- Test: `backend/chat/tests/test_analysis_runner.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/chat/tests/test_analysis_runner.py`:

```python
def test_run_market_analysis_creates_first_entry(user, monkeypatch):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.analysis_runner import run_market_analysis

    monkeypatch.setattr(tv, "build_verdict", lambda sym: {"confluence_score": 70, "episodes": []})
    monkeypatch.setattr(summary_service, "build_company_analysis_from_market",
                        lambda prior, sym, verdict: _result(True, summary="data view"))
    entry = run_market_analysis(user, "nmb")
    assert entry is not None
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
    assert entry.summary == "data view"


def test_run_market_analysis_material_change_appends(user, monkeypatch):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.analysis_runner import run_market_analysis

    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old")
    monkeypatch.setattr(tv, "build_verdict", lambda sym: {})
    monkeypatch.setattr(summary_service, "build_company_analysis_from_market",
                        lambda prior, sym, verdict: _result(True, summary="changed"))
    run_market_analysis(user, "NMB")
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 2


def test_run_market_analysis_survives_verdict_failure(user, monkeypatch):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.analysis_runner import run_market_analysis

    def boom(sym):
        raise RuntimeError("no prices")

    monkeypatch.setattr(tv, "build_verdict", boom)
    captured = {}
    monkeypatch.setattr(summary_service, "build_company_analysis_from_market",
                        lambda prior, sym, verdict: captured.setdefault("verdict", verdict) or _result(True, summary="ok"))
    entry = run_market_analysis(user, "NMB")
    assert entry is not None  # did not raise; proceeded with empty verdict
    assert captured["verdict"] == {}


def test_run_market_analysis_survives_build_failure(user, monkeypatch):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.analysis_runner import run_market_analysis

    prior = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="prior")
    monkeypatch.setattr(tv, "build_verdict", lambda sym: {})

    def boom(prior_entry, sym, verdict):
        raise RuntimeError("model down")

    monkeypatch.setattr(summary_service, "build_company_analysis_from_market", boom)
    entry = run_market_analysis(user, "NMB")
    assert entry.pk == prior.pk  # returns existing latest, no new row, no raise
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest chat/tests/test_analysis_runner.py -k run_market -v`
Expected: FAIL — `ImportError: cannot import name 'run_market_analysis'`.

- [ ] **Step 3: Implement `run_market_analysis`**

Append to `backend/chat/analysis_runner.py`:

```python
def run_market_analysis(user, symbol: str):
    """Ad-hoc, data-driven analysis: fold the company's current market verdict into
    the user's timeline. Returns the written/updated latest entry, or the existing
    latest (or None) if nothing could be produced. Never raises."""
    from chat.models import CompanyAnalysisEntry
    from chat import summary_service

    symbol = symbol.upper()
    try:
        from stocks.services.ticker_verdict import build_verdict
        verdict = build_verdict(symbol)
    except Exception:  # pylint: disable=broad-except
        log.exception("build_verdict failed for %s", symbol)
        verdict = {}
    prior = (
        CompanyAnalysisEntry.objects.filter(user=user, symbol=symbol)
        .order_by("-created_at")
        .first()
    )
    try:
        result = summary_service.build_company_analysis_from_market(prior, symbol, verdict)
    except Exception:  # pylint: disable=broad-except
        log.exception("market analysis build failed for %s", symbol)
        return prior
    return apply_analysis_result(user, symbol, prior, result, source_message=None)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_analysis_runner.py -v`
Expected: PASS (all runner tests).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/analysis_runner.py backend/chat/tests/test_analysis_runner.py
git commit -m "feat(chat): add run_market_analysis ad-hoc runner"
```

---

## Task 4: `POST .../run/` API endpoint

**Files:**
- Create: `backend/stocks/views/market/run_company_analysis.py`
- Modify: `backend/stocks/views/market/__init__.py`
- Modify: `backend/stocks/urls.py`
- Test: `backend/stocks/tests/test_company_chat_summary_api.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/stocks/tests/test_company_chat_summary_api.py`:

```python
def test_run_creates_and_returns_latest_entry(auth_user, monkeypatch, db):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.summary_service import CompanyAnalysisResult

    client, user = auth_user
    monkeypatch.setattr(tv, "build_verdict", lambda sym: {"confluence_score": 65, "episodes": []})
    monkeypatch.setattr(summary_service, "build_company_analysis_from_market",
                        lambda prior, sym, verdict: CompanyAnalysisResult(True, "fresh data view", "bullish", "technical", "score up"))
    res = client.post("/api/stocks/company-analysis/NMB/run/")
    assert res.status_code == 200
    assert res.data["summary"] == "fresh data view"
    assert res.data["stance"] == "bullish"
    assert res.data["aspect"] == "technical"
    assert res.data["symbol"] == "NMB"
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1


def test_run_requires_auth(api_client, db):
    assert api_client.post("/api/stocks/company-analysis/NMB/run/").status_code in (401, 403)


def test_run_scoped_to_request_user(auth_user, other_user, monkeypatch, db):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.summary_service import CompanyAnalysisResult

    client, user = auth_user
    monkeypatch.setattr(tv, "build_verdict", lambda sym: {})
    monkeypatch.setattr(summary_service, "build_company_analysis_from_market",
                        lambda prior, sym, verdict: CompanyAnalysisResult(True, "mine", "neutral", "both", ""))
    client.post("/api/stocks/company-analysis/NMB/run/")
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
    assert CompanyAnalysisEntry.objects.filter(user=other_user, symbol="NMB").count() == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest stocks/tests/test_company_chat_summary_api.py -k run -v`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Create the view**

Create `backend/stocks/views/market/run_company_analysis.py`:

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def run_company_analysis(request, ticker):
    """Run an ad-hoc, data-driven AI analysis for the signed-in user and return the
    new/updated latest entry."""
    from chat.analysis_runner import run_market_analysis

    symbol = ticker.upper()
    row = run_market_analysis(request.user, symbol)
    if row is None:
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({
        "symbol": symbol,
        "summary": row.summary,
        "stance": row.stance,
        "aspect": row.aspect,
        "updated_at": row.updated_at,
    })
```

- [ ] **Step 4: Export the view and register the route**

In `backend/stocks/views/market/__init__.py`, add alongside the other company-analysis import:

```python
from .run_company_analysis import run_company_analysis
```

In `backend/stocks/urls.py`, add next to the existing `company-analysis` path:

```python
    path('company-analysis/<str:ticker>/run/', market.run_company_analysis, name='run_company_analysis'),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest stocks/tests/test_company_chat_summary_api.py -v`
Expected: PASS (all existing api tests + the 3 new run tests).

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/views/market/run_company_analysis.py backend/stocks/views/market/__init__.py backend/stocks/urls.py backend/stocks/tests/test_company_chat_summary_api.py
git commit -m "feat(stocks): POST run-analysis endpoint"
```

---

## Task 5: Frontend — "Run analysis" button + wiring

**Files:**
- Modify: `frontend/src/components/ticker/CompanyAnalysisTimeline.tsx`
- Modify: `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx`

- [ ] **Step 1: Add the button to the timeline component**

Replace the `CompanyAnalysisTimeline` export in `frontend/src/components/ticker/CompanyAnalysisTimeline.tsx` (keep `TimelineRow` and the imports/interface unchanged) with:

```tsx
export function CompanyAnalysisTimeline({ entries, onRun, running }: {
    entries: AnalysisEntry[];
    onRun?: () => void;
    running?: boolean;
}) {
    return (
        <div className="space-y-3">
            {onRun && (
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onRun}
                        disabled={running}
                        className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                    >
                        {running ? 'Running…' : 'Run analysis'}
                    </button>
                    <span className="text-xs text-muted-foreground">
                        Analyzes current technical &amp; fundamental data.
                    </span>
                </div>
            )}
            {!entries || entries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8">
                    No AI analysis yet — run an analysis or discuss this stock in chat to build one.
                </p>
            ) : (
                <ul className="mt-2">
                    {entries.map((entry, i) => (
                        <TimelineRow key={`${entry.created_at}-${i}`} entry={entry} />
                    ))}
                </ul>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Add `running` state in the ticker page**

In `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx`, right after the `const [analysisTimeline, setAnalysisTimeline] = useState<AnalysisEntry[]>([]);` line (~line 147), add:

```tsx
    const [runningAnalysis, setRunningAnalysis] = useState(false);
```

- [ ] **Step 3: Add the run handler**

In the same component, add a `runAnalysis` handler. Place it just before the `return (` of the component's JSX (after the existing effects/handlers). It posts, then refetches both the timeline and the latest-entry card:

```tsx
    const runAnalysis = async () => {
        setRunningAnalysis(true);
        try {
            await api.post(`/api/stocks/company-analysis/${ticker}/run/`);
            const [tlRes, sumRes] = await Promise.all([
                api.get(`/api/stocks/company-analysis/${ticker}/`),
                api.get(`/api/stocks/company-summary/${ticker}/`),
            ]);
            setAnalysisTimeline(Array.isArray(tlRes.data) ? tlRes.data : []);
            setChatNotes(sumRes.data && sumRes.data.summary ? sumRes.data : null);
        } catch (e) {
            console.error("Run analysis failed", e);
        } finally {
            setRunningAnalysis(false);
        }
    };
```

- [ ] **Step 4: Pass the props into the tab**

Change the `ai_analysis` TabsContent body (~line 1065) from:

```tsx
                                    <CompanyAnalysisTimeline entries={analysisTimeline} />
```

to:

```tsx
                                    <CompanyAnalysisTimeline entries={analysisTimeline} onRun={runAnalysis} running={runningAnalysis} />
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors from `CompanyAnalysisTimeline.tsx` or `page.tsx`. (Pre-existing unrelated errors in test files / `PlanSidebar.tsx` / `ThemeAwareECharts.tsx` / `TradePlanDrawer.tsx` are not your concern.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ticker/CompanyAnalysisTimeline.tsx "frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx"
git commit -m "feat(ticker): run-analysis button in AI analysis tab"
```

---

## Deployment notes

- **No migration** (no schema change).
- **Backend** is volume-mounted — `runserver` auto-reloads the new view/service/runner. No image rebuild, no Celery restart (the run path is synchronous and doesn't touch the worker).
- **Frontend**: rebuild + recreate (`docker compose build frontend && docker compose up -d frontend`) + hard refresh.
- Smoke test: open a ticker's AI analysis tab → click "Run analysis" → after ~5s a new/updated entry appears; repeated clicks with no change refine the latest entry rather than adding rows.

---

## Self-review notes

- **Spec coverage:** shared write `apply_analysis_result` (T1); `_summarize_verdict` + `build_company_analysis_from_market` + `MARKET_ANALYSIS_SYSTEM` (T2); `run_market_analysis` with graceful `build_verdict`/build failure (T3); sync POST endpoint, user-scoped, bootstrap, auth (T4); button + sync run + refetch, empty-state copy (T5). DRY refactor keeps chat path on one write and is regression-checked (T1 Step 5). Error handling: runner never raises; frontend catch re-enables button.
- **Type/name consistency:** `apply_analysis_result(user, symbol, prior, result, source_message=None)`, `run_market_analysis(user, symbol)`, `build_company_analysis_from_market(prior_entry, symbol, verdict)`, `_summarize_verdict`, `run_company_analysis` view, route name `run_company_analysis`, and frontend `onRun`/`running` props are used identically across tasks.
- **Green-at-each-commit:** T1 refactor is behaviour-preserving (chat tests regress-checked); T2–T4 are additive; T5 is frontend-only.
- **No magic strings:** the chat-vs-manual distinction is `source_message=None`, not a sentinel; reuses `_parse_analysis`/`_run_summary`/`CompanyAnalysisResult`.

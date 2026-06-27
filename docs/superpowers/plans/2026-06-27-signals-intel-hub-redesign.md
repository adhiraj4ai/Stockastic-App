# Signals / Intel Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two competing `/signals` UIs with one theme-native board that organizes every signal source into three family lanes (Accumulation · Technical · Your strategies), surfaces cross-family consensus, explains why each signal fired, teaches terms on hover, and includes the accumulation-trading candidates.

**Architecture:** Thin backend additions over existing data — a source→family map, a glossary, a metadata→conditions formatter, and one `board` endpoint that merges `SignalEpisode`s (10 engines + `USER_STRATEGY`) with active `AccumulationCandidate`s (as `ACCUMULATION_STRATEGY`) and precomputes consensus. A new frontend board (lanes, cards, conviction meter, why-it-fired drawer, glossary tooltips) bound entirely to the app's existing theme tokens and `DashboardLayout`, replacing `SignalsPageClient` and `IntelHubClient`.

**Tech Stack:** Django 5.2 + DRF, pytest (Docker); Next.js 16 + React 19, shadcn/ui, vitest.

## Global Constraints

- **Current theme, zero deviation:** bind to existing tokens (`--background`, `--card`, `--foreground`, `--muted`, `--muted-foreground`, `--border`, `--ring`, `--primary`); render inside `DashboardLayout`; light + warm-dark via the existing theme. No new palette, no bespoke ground.
- **No new accent:** conviction meter fills with neutral `--foreground` (never `--primary`, which is the buy green); consensus chip is a neutral `--border` outline (direction-agnostic).
- **Direction semantics (existing):** emerald = buy, rose = sell, amber = watch.
- **Sentence case, warm sans, no all-caps, no monospace.** Tabular figures (`tabular-nums`) on every metric. Format decimals via `lib/numbers`.
- **TDD mandatory** (red → green → refactor); every function ≤ 30 lines; one responsibility; no magic numbers; delete dead code.
- **Backend DB tests run in Docker:** `docker-compose exec -T backend pytest <path>`. Frontend tests: `cd frontend && npx vitest run <path>`.
- **Reuse** existing `Card`/`Badge`/`Tabs`/`Tooltip`/`Dialog`, `AnalysisTabs`, `StockLoader`, `lib/numbers`.
- **Branch:** `feat/accumulation-trading` (already checked out — holds the accumulation feature + this spec; all work lands here).

---

### Task 1: source→family map

**Files:**
- Create: `backend/stocks/services/signals/families.py`
- Test: `backend/stocks/tests/test_signal_families.py`

**Interfaces:**
- Produces: `FAMILIES = ("accumulation", "technical", "your_strategies")`;
  `ACCUMULATION_SOURCES: set[str]`; `family_for(source: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_signal_families.py
from stocks.services.signals.families import family_for, FAMILIES


def test_accumulation_sources_map_to_accumulation():
    for s in ["SMART_MONEY", "DISTRIBUTION_ALERT", "BELOW_COST_REVERSAL",
              "CONCENTRATION_SHIFT", "ACC_MOMENTUM", "BROKER_ACCUMULATION",
              "ACCUMULATION_STRATEGY"]:
        assert family_for(s) == "accumulation"


def test_user_strategy_and_technical_and_unknown():
    assert family_for("USER_STRATEGY") == "your_strategies"
    assert family_for("VOLUME_BREAKOUT") == "technical"
    assert family_for("ICHIMOKU") == "technical"
    assert family_for("SOMETHING_NEW") == "technical"  # safe fallback
    assert set(FAMILIES) == {"accumulation", "technical", "your_strategies"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_families.py -v`
Expected: FAIL with `ModuleNotFoundError: ...signals.families`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/signals/families.py
"""Classify a signal source into one of the three board lanes."""
import logging

logger = logging.getLogger(__name__)

FAMILIES = ("accumulation", "technical", "your_strategies")

ACCUMULATION_SOURCES = {
    "SMART_MONEY", "DISTRIBUTION_ALERT", "BELOW_COST_REVERSAL",
    "CONCENTRATION_SHIFT", "ACC_MOMENTUM", "BROKER_ACCUMULATION",
    "ACCUMULATION_STRATEGY",
}
TECHNICAL_SOURCES = {
    "VOLUME_BREAKOUT", "INSTITUTIONAL_ALERTS", "ICHIMOKU", "SMART_CROSSOVER",
    "PRICE_ACTION", "MEAN_REVERSAL", "RSI_DIVERGENCE", "MACD_DIVERGENCE", "DOW_SIGNAL",
}


def family_for(source):
    """Map a source key to a lane. Unknown sources fall back to technical."""
    if source == "USER_STRATEGY":
        return "your_strategies"
    if source in ACCUMULATION_SOURCES:
        return "accumulation"
    if source not in TECHNICAL_SOURCES:
        logger.warning("Unknown signal source %r → technical lane", source)
    return "technical"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_families.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signals/families.py backend/stocks/tests/test_signal_families.py
git commit -m "feat(signals): source→family lane map"
```

---

### Task 2: signal glossary + endpoint

**Files:**
- Create: `backend/stocks/services/signals/glossary.py`
- Create: `backend/stocks/views/signal_glossary_view.py`
- Modify: `backend/stocks/urls.py` (register the glossary route)
- Test: `backend/stocks/tests/test_signal_glossary.py`

**Interfaces:**
- Consumes: tier vocabulary per source (below).
- Produces: `GLOSSARY: dict` with keys `sources`, `tiers`, `terms`; `describe(kind, key) -> dict|None`;
  `GET /api/stocks/signal-glossary/` returns `GLOSSARY`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_signal_glossary.py
import pytest
from rest_framework.test import APIClient

from stocks.services.signals.glossary import GLOSSARY, describe


def test_every_source_has_label_and_description():
    for src in ["SMART_MONEY", "DISTRIBUTION_ALERT", "BELOW_COST_REVERSAL",
                "CONCENTRATION_SHIFT", "ACC_MOMENTUM", "BROKER_ACCUMULATION",
                "VOLUME_BREAKOUT", "INSTITUTIONAL_ALERTS", "ICHIMOKU",
                "SMART_CROSSOVER", "USER_STRATEGY", "ACCUMULATION_STRATEGY"]:
        entry = describe("sources", src)
        assert entry and entry["label"] and entry["description"]


def test_known_tiers_and_factor_terms_present():
    assert describe("tiers", "Platinum Buy")["description"]
    assert describe("tiers", "validated")["description"]
    assert describe("terms", "concentration")["description"]
    assert describe("sources", "NOPE") is None


@pytest.mark.django_db
def test_glossary_endpoint_returns_map():
    resp = APIClient().get("/api/stocks/signal-glossary/")
    assert resp.status_code == 200
    assert "sources" in resp.data and "tiers" in resp.data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_glossary.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3a: Create the glossary module**

```python
# backend/stocks/services/signals/glossary.py
"""Plain-language labels + descriptions for signal sources, tiers, and terms.

Authored beside the engines so tooltips and the detail drawer stay in sync.
"""

_SOURCES = {
    "SMART_MONEY": ("Smart money", "Top-15 brokers by net holdings clustering near their cost basis — highest-conviction accumulation."),
    "DISTRIBUTION_ALERT": ("Distribution alert", "Smart-money brokers reducing positions — net selling over the last 5 days."),
    "BELOW_COST_REVERSAL": ("Below-cost reversal", "Smart-money brokers buying under their weighted average cost — conviction at a loss."),
    "CONCENTRATION_SHIFT": ("Concentration shift", "New smart-money brokers entering (or leaving) the top-15 holders — widening or narrowing interest."),
    "ACC_MOMENTUM": ("Accumulation momentum", "Accelerating accumulation: recent net-buying pace outrunning the slower trend."),
    "BROKER_ACCUMULATION": ("Broker accumulation", "Broker accumulation patterns confirmed by price and volume technicals."),
    "ACCUMULATION_STRATEGY": ("Accumulation strategy", "The calibrated accumulation score (concentration + coiling + breakout). Tier shows whether it passed out-of-sample validation."),
    "VOLUME_BREAKOUT": ("Volume breakout", "Volume above 2× its 20-day average with price up and institutions net buyers."),
    "INSTITUTIONAL_ALERTS": ("Institutional alerts", "Technical scanner: price action, mean reversion, RSI/MACD divergence, and Dow range breaks."),
    "ICHIMOKU": ("Ichimoku", "Price breaking the Ichimoku cloud, with accumulation context."),
    "SMART_CROSSOVER": ("Smart crossover", "Moving-average / MACD crossover combined with broker-accumulation context."),
    "USER_STRATEGY": ("Your strategy", "A backtested strategy you composed. Closes on a signal flip — no fixed stop or target."),
}

_TIERS = {
    "Platinum Buy": "4+ smart-money brokers clustered near cost with markup confirmed. Strongest accumulation tier.",
    "Gold Signal": "2–3 smart-money brokers accumulating with positive net flow.",
    "Silver Signal": "Early accumulation by one or two smart-money brokers.",
    "Bullish Divergence": "Price soft while smart money keeps accumulating.",
    "Heavy Distribution": "Multiple smart-money brokers selling hard — strong exit pressure.",
    "Accelerating Sell-off": "Distribution pace increasing.",
    "Distribution Warning": "Early smart-money selling detected.",
    "Surge Accumulation": "Net-buying pace surging well above trend.",
    "Accelerating Accumulation": "Accumulation pace rising.",
    "Building Momentum": "Steady, building accumulation.",
    "Deep Value Accumulation": "Heavy buying well below brokers' average cost.",
    "Institutional Averaging": "Brokers averaging down below cost.",
    "Below-Cost Buying": "Buying under the weighted average cost.",
    "Broadening Interest": "More brokers entering the top holders.",
    "New Entrants": "Fresh smart-money names appearing.",
    "Narrowing Interest": "Brokers exiting the top holders.",
    "Holder Exit": "Smart money leaving the name.",
    "Volume Breakout": "Volume surge confirming an upside break.",
    "Volume Surge": "Unusual volume expansion.",
    "Volume Breakdown": "Volume surge on a downside break.",
    "Volume Sell-off": "Heavy selling volume.",
    "Smart Crossover": "Moving-average / MACD crossover with accumulation context.",
    "validated": "Passed out-of-sample validation against buy-and-hold — eligible to trade.",
    "research": "Did not clear the out-of-sample bar — shown for review, not auto-tradeable.",
}

_TERMS = {
    "concentration": "Share of net buying held by the top few brokers — a few big hands, not broad retail.",
    "coiling": "Accumulation rising while price stays flat and volatility compresses — quiet build before markup.",
    "breakout": "Price crossing above its recent high while accumulation stays positive.",
    "conviction": "How strongly the evidence supports the signal (0–100). Separate from buy vs sell.",
    "consensus": "How many independent strategy families agree on this symbol and direction.",
}


def _pack(d):
    return {k: {"label": (v[0] if isinstance(v, tuple) else k), "description": (v[1] if isinstance(v, tuple) else v)}
            for k, v in d.items()}


GLOSSARY = {"sources": _pack(_SOURCES), "tiers": _pack(_TIERS), "terms": _pack(_TERMS)}


def describe(kind, key):
    """Return {label, description} for a glossary entry, or None if unknown."""
    return GLOSSARY.get(kind, {}).get(key)
```

- [ ] **Step 3b: Create the endpoint**

```python
# backend/stocks/views/signal_glossary_view.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from stocks.services.signals.glossary import GLOSSARY


@api_view(["GET"])
@permission_classes([AllowAny])
def signal_glossary(request):
    """Plain-language labels + descriptions for signal sources, tiers, and terms."""
    return Response(GLOSSARY)
```

- [ ] **Step 3c: Register the route in urls.py** (with the other `path(...)` entries)

```python
from .views.signal_glossary_view import signal_glossary
# inside urlpatterns:
path('signal-glossary/', signal_glossary, name='signal-glossary'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_glossary.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signals/glossary.py backend/stocks/views/signal_glossary_view.py backend/stocks/urls.py backend/stocks/tests/test_signal_glossary.py
git commit -m "feat(signals): glossary module + /signal-glossary endpoint"
```

---

### Task 3: metadata → conditions formatter

**Files:**
- Create: `backend/stocks/services/signals/conditions.py`
- Test: `backend/stocks/tests/test_signal_conditions.py`

**Interfaces:**
- Produces: `format_conditions(source: str, metadata: dict) -> list[str]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_signal_conditions.py
from stocks.services.signals.conditions import format_conditions


def test_smart_money_conditions_are_labeled():
    lines = format_conditions("SMART_MONEY", {"cluster_count": 4, "net_5d": 120000})
    assert any("4" in l and "cluster" in l.lower() for l in lines)
    assert any("120,000" in l or "120000" in l for l in lines)


def test_accumulation_strategy_uses_factor_breakdown():
    lines = format_conditions("ACCUMULATION_STRATEGY",
                              {"concentration": 0.9, "coiling": 0.7, "breakout": 1.0, "score": 82.0})
    assert any("concentration" in l.lower() for l in lines)
    assert any("82" in l for l in lines)


def test_unknown_keys_fall_back_without_error():
    lines = format_conditions("WHATEVER", {"foo_bar": 3})
    assert lines == ["Foo bar: 3"]
    assert format_conditions("WHATEVER", {}) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_conditions.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/signals/conditions.py
"""Turn a signal's metadata into labeled, plain-language trigger lines."""


def _n(v):
    """Format a number with thousands separators; pass through non-numbers."""
    if isinstance(v, (int, float)):
        return f"{v:,.0f}" if abs(v) >= 1000 else f"{v:g}"
    return str(v)


def _smart_money(m):
    out = []
    if m.get("cluster_count"):
        out.append(f"{m['cluster_count']} smart-money brokers clustered near cost")
    if m.get("net_5d"):
        out.append(f"Net {_n(m['net_5d'])} shares over 5 days")
    return out


def _accumulation_strategy(m):
    out = []
    for key in ("concentration", "coiling", "breakout"):
        if key in m:
            out.append(f"{key.capitalize()} factor {float(m[key]):.2f}")
    if "score" in m:
        out.append(f"Composite accumulation score {float(m['score']):.0f}")
    return out


_FORMATTERS = {"SMART_MONEY": _smart_money, "ACCUMULATION_STRATEGY": _accumulation_strategy}


def _generic(metadata):
    """Fallback: render known scalar metadata as 'Label: value' lines."""
    return [f"{k.replace('_', ' ').capitalize()}: {_n(v)}"
            for k, v in metadata.items() if isinstance(v, (int, float, str))]


def format_conditions(source, metadata):
    """Labeled trigger lines for a source; generic fallback for unmapped sources."""
    metadata = metadata or {}
    formatter = _FORMATTERS.get(source)
    lines = formatter(metadata) if formatter else []
    return lines or _generic(metadata)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_conditions.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signals/conditions.py backend/stocks/tests/test_signal_conditions.py
git commit -m "feat(signals): metadata→conditions formatter"
```

---

### Task 4: board endpoint (merge episodes + accumulation candidates + consensus)

**Files:**
- Create: `backend/stocks/services/signals/board.py`
- Modify: `backend/stocks/views/strategy/strategy_signal_view_set.py` (add `board` action)
- Test: `backend/stocks/tests/test_signal_board.py`

**Interfaces:**
- Consumes: `family_for` (T1), `format_conditions` (T3), `SignalEpisodeSerializer`, `AccumulationCandidate`.
- Produces: `build_board(direction=None, symbol=None, min_families=1, include_historical=False) -> dict`
  returning `{"cards": [...], "consensus": {symbol: {"families": [...], "count": N}}}`;
  `GET /api/stocks/signals/board/`. Each card: `{source, family, symbol, direction, strength, tier, entry_price, stop_loss_price, target_price, conditions, validation_state, freshness_date, strategy_name}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_signal_board.py
from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from stocks.models import SignalEpisode, AccumulationCandidate


@pytest.mark.django_db
def test_board_merges_candidate_into_accumulation_and_computes_consensus():
    SignalEpisode.objects.create(
        source="ICHIMOKU", producer_key="ICHIMOKU", symbol="NABIL", direction="BUY",
        start_date=date(2026, 6, 17), entry_price=Decimal("520"), entry_strength=74,
        signal_tier="cloud breakout", status="ACTIVE", metadata={})
    AccumulationCandidate.objects.create(
        symbol="NABIL", scan_date=date(2026, 6, 17), score=Decimal("82"),
        factors={"concentration": 0.9, "coiling": 0.7, "breakout": 1.0, "score": 82.0},
        suggested_entry=Decimal("520"), suggested_stop=Decimal("500"),
        suggested_target=Decimal("560"), validation_state="research",
        status=AccumulationCandidate.Status.ACTIVE)
    resp = APIClient().get("/api/stocks/signals/board/")
    assert resp.status_code == 200
    fams = {c["family"] for c in resp.data["cards"] if c["symbol"] == "NABIL"}
    assert fams == {"accumulation", "technical"}
    assert resp.data["consensus"]["NABIL"]["count"] == 2
    acc = next(c for c in resp.data["cards"] if c["source"] == "ACCUMULATION_STRATEGY")
    assert acc["tier"] == "research" and float(acc["strength"]) == 82.0
    assert any("oncentration" in line for line in acc["conditions"])


@pytest.mark.django_db
def test_board_min_families_filter():
    SignalEpisode.objects.create(
        source="VOLUME_BREAKOUT", producer_key="VOLUME_BREAKOUT", symbol="API",
        direction="BUY", start_date=date(2026, 6, 17), entry_price=Decimal("248"),
        entry_strength=64, status="ACTIVE", metadata={})
    resp = APIClient().get("/api/stocks/signals/board/?min_families=2")
    assert all(c["symbol"] != "API" for c in resp.data["cards"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_board.py -v`
Expected: FAIL (`board` action missing → 404)

- [ ] **Step 3a: Create the board builder**

```python
# backend/stocks/services/signals/board.py
"""Merge signal episodes + accumulation candidates into one lane-tagged board."""
from collections import defaultdict

from stocks.models import AccumulationCandidate, SignalEpisode
from stocks.serializers.signal import SignalEpisodeSerializer
from stocks.services.signals.conditions import format_conditions
from stocks.services.signals.families import family_for

ACCUMULATION_STRATEGY = "ACCUMULATION_STRATEGY"


def _episode_card(ep):
    data = SignalEpisodeSerializer(ep).data
    return {
        "source": ep.source, "family": family_for(ep.source), "symbol": ep.symbol,
        "direction": ep.direction, "strength": ep.entry_strength,
        "tier": ep.signal_tier or "", "entry_price": data["entry_price"],
        "stop_loss_price": data["stop_loss_price"], "target_price": data["target_price"],
        "conditions": format_conditions(ep.source, ep.metadata or {}),
        "validation_state": None, "freshness_date": data["last_signal_date"] or data["start_date"],
        "strategy_name": data["strategy_name"], "rationale": ep.rationale or "",
    }


def _candidate_card(c):
    return {
        "source": ACCUMULATION_STRATEGY, "family": "accumulation", "symbol": c.symbol,
        "direction": "BUY", "strength": float(c.score), "tier": c.validation_state,
        "entry_price": c.suggested_entry, "stop_loss_price": c.suggested_stop,
        "target_price": c.suggested_target,
        "conditions": format_conditions(ACCUMULATION_STRATEGY, c.factors or {}),
        "validation_state": c.validation_state, "freshness_date": c.scan_date,
        "strategy_name": "Accumulation strategy", "rationale": "",
    }


def _collect(include_historical):
    eps = SignalEpisode.objects.all() if include_historical else SignalEpisode.objects.filter(status="ACTIVE")
    cards = [_episode_card(e) for e in eps.order_by("-start_date")]
    cands = AccumulationCandidate.objects.filter(status=AccumulationCandidate.Status.ACTIVE)
    cards += [_candidate_card(c) for c in cands.order_by("-score")]
    return cards


def _consensus(cards):
    by_symbol = defaultdict(lambda: defaultdict(set))
    for c in cards:
        by_symbol[c["symbol"]][c["direction"]].add(c["family"])
    out = {}
    for sym, by_dir in by_symbol.items():
        fams = max(by_dir.values(), key=len)
        out[sym] = {"families": sorted(fams), "count": len(fams)}
    return out


def build_board(direction=None, symbol=None, min_families=1, include_historical=False):
    cards = _collect(include_historical)
    if direction:
        cards = [c for c in cards if c["direction"] == direction.upper()]
    if symbol:
        cards = [c for c in cards if c["symbol"] == symbol.upper()]
    consensus = _consensus(cards)
    if min_families > 1:
        cards = [c for c in cards if consensus.get(c["symbol"], {}).get("count", 0) >= min_families]
    return {"cards": sorted(cards, key=lambda c: c["strength"] or 0, reverse=True),
            "consensus": consensus}
```

- [ ] **Step 3b: Add the `board` action to StrategySignalViewSet**

```python
# in backend/stocks/views/strategy/strategy_signal_view_set.py, alongside `tracking`
    @action(detail=False, methods=['get'])
    def board(self, request):
        from stocks.services.signals.board import build_board
        q = request.query_params
        return Response(build_board(
            direction=q.get('direction') or None,
            symbol=q.get('symbol') or None,
            min_families=int(q.get('min_families', 1)),
            include_historical=q.get('include_historical') == 'true',
        ))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_board.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signals/board.py backend/stocks/views/strategy/strategy_signal_view_set.py backend/stocks/tests/test_signal_board.py
git commit -m "feat(signals): board endpoint merging episodes + accumulation candidates + consensus"
```

---

### Task 5: frontend api client + types

**Files:**
- Create: `frontend/src/types/signals-board.ts`
- Modify: `frontend/src/lib/api.ts` (append `signalsApi`)
- Test: `frontend/src/__tests__/unit/signalsApi.test.ts`

**Interfaces:**
- Produces:
  - types `SignalCardData`, `BoardResponse`, `Glossary` (matching Task 4 + Task 2 payloads).
  - `signalsApi.board(params?: Record<string,string>)`, `signalsApi.glossary()`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/unit/signalsApi.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import api, { signalsApi } from '@/lib/api';

describe('signalsApi', () => {
    afterEach(() => vi.restoreAllMocks());
    it('requests the board with filters', () => {
        const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: {} } as never);
        signalsApi.board({ direction: 'BUY', min_families: '2' });
        expect(spy).toHaveBeenCalledWith('/api/stocks/signals/board/?direction=BUY&min_families=2');
    });
    it('requests the glossary', () => {
        const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: {} } as never);
        signalsApi.glossary();
        expect(spy).toHaveBeenCalledWith('/api/stocks/signal-glossary/');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/signalsApi.test.ts`
Expected: FAIL — `signalsApi` export not found.

- [ ] **Step 3a: Types file**

```typescript
// frontend/src/types/signals-board.ts
export type Family = 'accumulation' | 'technical' | 'your_strategies';

export interface SignalCardData {
    source: string;
    family: Family;
    symbol: string;
    direction: 'BUY' | 'SELL';
    strength: number | null;
    tier: string;
    entry_price: string | null;
    stop_loss_price: string | null;
    target_price: string | null;
    conditions: string[];
    validation_state: 'validated' | 'research' | null;
    freshness_date: string | null;
    strategy_name: string;
    rationale: string;
}

export interface BoardResponse {
    cards: SignalCardData[];
    consensus: Record<string, { families: Family[]; count: number }>;
}

export interface GlossaryEntry { label: string; description: string; }
export interface Glossary {
    sources: Record<string, GlossaryEntry>;
    tiers: Record<string, GlossaryEntry>;
    terms: Record<string, GlossaryEntry>;
}
```

- [ ] **Step 3b: API client (append before `export default api`)**

```typescript
import type { BoardResponse, Glossary } from '@/types/signals-board';

export const signalsApi = {
    board: (params: Record<string, string> = {}) => {
        const qs = new URLSearchParams(params).toString();
        return api.get<BoardResponse>(`/api/stocks/signals/board/${qs ? `?${qs}` : ''}`);
    },
    glossary: () => api.get<Glossary>('/api/stocks/signal-glossary/'),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/signalsApi.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/signals-board.ts frontend/src/lib/api.ts frontend/src/__tests__/unit/signalsApi.test.ts
git commit -m "feat(signals): frontend board api client + types"
```

---

### Task 6: GlossaryTooltip + ConvictionMeter components

**Files:**
- Create: `frontend/src/components/signals/GlossaryTooltip.tsx`
- Create: `frontend/src/components/signals/ConvictionMeter.tsx`
- Test: `frontend/src/__tests__/unit/SignalsAtoms.test.tsx`

**Interfaces:**
- Produces:
  - `<GlossaryTooltip entry={GlossaryEntry|undefined} fallback={string}>` — renders the fallback text as a dotted-underline trigger; on hover/focus shows `entry.label`/`entry.description`. If `entry` is undefined, renders plain text (no tooltip).
  - `<ConvictionMeter value={number} />` — neutral `--foreground` fill bar with a tabular number.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/SignalsAtoms.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GlossaryTooltip } from '@/components/signals/GlossaryTooltip';
import { ConvictionMeter } from '@/components/signals/ConvictionMeter';

describe('signals atoms', () => {
    it('GlossaryTooltip shows the trigger text and carries the description', () => {
        render(<GlossaryTooltip entry={{ label: 'Smart money', description: 'Top brokers near cost.' }} fallback="smart money" />);
        expect(screen.getByText('smart money')).toBeInTheDocument();
        expect(screen.getByText('smart money')).toHaveAttribute('aria-label', expect.stringContaining('Top brokers'));
    });
    it('GlossaryTooltip renders plain text when no entry', () => {
        render(<GlossaryTooltip entry={undefined} fallback="mystery" />);
        expect(screen.getByText('mystery')).toBeInTheDocument();
    });
    it('ConvictionMeter shows the rounded value', () => {
        render(<ConvictionMeter value={82.4} />);
        expect(screen.getByText('82')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalsAtoms.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3a: GlossaryTooltip** (uses shadcn Tooltip; `aria-label` carries the description for accessibility + testability)

```tsx
// frontend/src/components/signals/GlossaryTooltip.tsx
'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { GlossaryEntry } from '@/types/signals-board';

interface Props { entry?: GlossaryEntry; fallback: string; }

export function GlossaryTooltip({ entry, fallback }: Props) {
    if (!entry) return <span>{fallback}</span>;
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span tabIndex={0} aria-label={`${entry.label}: ${entry.description}`}
                          className="border-b border-dotted border-muted-foreground/50 cursor-help">
                        {fallback}
                    </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px]">
                    <span className="block font-medium">{entry.label}</span>
                    <span className="block text-muted-foreground">{entry.description}</span>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
```

- [ ] **Step 3b: ConvictionMeter** (neutral fill — `bg-foreground`, never the buy-green primary)

```tsx
// frontend/src/components/signals/ConvictionMeter.tsx
import { fixed } from '@/lib/numbers';

export function ConvictionMeter({ value }: { value: number }) {
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div className="flex items-center gap-2">
            <span className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                <span className="block h-full rounded-full bg-foreground/80" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground" style={{ minWidth: 20 }}>
                {fixed(value, 0)}
            </span>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalsAtoms.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/signals/GlossaryTooltip.tsx frontend/src/components/signals/ConvictionMeter.tsx frontend/src/__tests__/unit/SignalsAtoms.test.tsx
git commit -m "feat(signals): GlossaryTooltip + ConvictionMeter (theme-bound)"
```

---

### Task 7: SignalCard

**Files:**
- Create: `frontend/src/components/signals/SignalCard.tsx`
- Test: `frontend/src/__tests__/unit/SignalCard.test.tsx`

**Interfaces:**
- Consumes: `SignalCardData`, `Glossary` (T5); `ConvictionMeter`, `GlossaryTooltip` (T6); `lib/numbers`.
- Produces: `<SignalCard card={SignalCardData} consensusCount={number} glossary={Glossary|null} onOpen={(card)=>void} />`.
  Shows symbol, buy/sell badge, source (glossary tooltip), tier (glossary tooltip), conviction meter, levels (or "close on flip" when no stop/target), consensus chip when `consensusCount>=2`, freshness. Whole card is a button calling `onOpen`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/SignalCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SignalCard } from '@/components/signals/SignalCard';
import type { SignalCardData } from '@/types/signals-board';

const base: SignalCardData = {
    source: 'SMART_MONEY', family: 'accumulation', symbol: 'NABIL', direction: 'BUY',
    strength: 88, tier: 'Platinum Buy', entry_price: '520.00', stop_loss_price: '500.00',
    target_price: '560.00', conditions: [], validation_state: null, freshness_date: '2026-06-15',
    strategy_name: 'Smart money', rationale: '',
};

describe('SignalCard', () => {
    it('renders symbol, levels, and a consensus chip at >=2 families', () => {
        render(<SignalCard card={base} consensusCount={2} glossary={null} onOpen={vi.fn()} />);
        expect(screen.getByText('NABIL')).toBeInTheDocument();
        expect(screen.getByText('560.00')).toBeInTheDocument();
        expect(screen.getByText(/confirmed by 2 families/i)).toBeInTheDocument();
    });
    it('shows close-on-flip for user strategies (no stop/target) and fires onOpen', () => {
        const onOpen = vi.fn();
        const strat = { ...base, source: 'USER_STRATEGY', family: 'your_strategies' as const, stop_loss_price: null, target_price: null };
        render(<SignalCard card={strat} consensusCount={1} glossary={null} onOpen={onOpen} />);
        expect(screen.getByText(/close on flip/i)).toBeInTheDocument();
        expect(screen.queryByText(/confirmed by/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button'));
        expect(onOpen).toHaveBeenCalledWith(strat);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/signals/SignalCard.tsx
'use client';

import { fixed } from '@/lib/numbers';
import { ConvictionMeter } from './ConvictionMeter';
import { GlossaryTooltip } from './GlossaryTooltip';
import type { Glossary, SignalCardData } from '@/types/signals-board';

interface Props {
    card: SignalCardData;
    consensusCount: number;
    glossary: Glossary | null;
    onOpen: (card: SignalCardData) => void;
}

function Levels({ card }: { card: SignalCardData }) {
    if (!card.stop_loss_price || !card.target_price) {
        return <div className="text-xs text-muted-foreground tabular-nums">
            entry <b className="text-foreground">{fixed(card.entry_price, 2)}</b>
            <span className="ml-3 text-muted-foreground/70">close on flip</span></div>;
    }
    return <div className="flex gap-3 text-xs text-muted-foreground tabular-nums">
        <span>entry <b className="text-foreground">{fixed(card.entry_price, 2)}</b></span>
        <span>stop <b className="text-foreground">{fixed(card.stop_loss_price, 2)}</b></span>
        <span>target <b className="text-foreground">{fixed(card.target_price, 2)}</b></span></div>;
}

export function SignalCard({ card, consensusCount, glossary, onOpen }: Props) {
    const isBuy = card.direction === 'BUY';
    return (
        <button onClick={() => onOpen(card)}
            className="w-full text-left flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:bg-accent">
            <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight">{card.symbol}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isBuy ? 'text-emerald-600 bg-emerald-500/10' : 'text-rose-600 bg-rose-500/10'}`}>
                    {isBuy ? 'buy' : 'sell'}</span>
                <span className="ml-auto text-xs text-muted-foreground">detail ▸</span>
            </div>
            <div className="text-xs text-muted-foreground">
                <GlossaryTooltip entry={glossary?.sources[card.source]} fallback={card.strategy_name.toLowerCase()} />
            </div>
            <div className="flex items-center gap-2">
                <ConvictionMeter value={card.strength ?? 0} />
                {card.tier && <span className="text-[11px] text-muted-foreground">
                    <GlossaryTooltip entry={glossary?.tiers[card.tier]} fallback={card.tier.toLowerCase()} /></span>}
            </div>
            <Levels card={card} />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {consensusCount >= 2 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-ring" />confirmed by {consensusCount} families</span>)}
                {card.freshness_date && <span className="ml-auto tabular-nums">{card.freshness_date}</span>}
            </div>
        </button>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalCard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/signals/SignalCard.tsx frontend/src/__tests__/unit/SignalCard.test.tsx
git commit -m "feat(signals): SignalCard (consensus chip, close-on-flip, gated action)"
```

---

### Task 8: SignalDetailDrawer (why this fired)

**Files:**
- Create: `frontend/src/components/signals/SignalDetailDrawer.tsx`
- Test: `frontend/src/__tests__/unit/SignalDetailDrawer.test.tsx`

**Interfaces:**
- Consumes: `SignalCardData[]` (all cards for the opened symbol+direction), `AnalysisTabs` (`@/components/analysis/AnalysisTabs`, props `{symbol, ladder}`), `lib/numbers`.
- Produces: `<SignalDetailDrawer symbol={string} cards={SignalCardData[]} open={boolean} onClose={()=>void} />`.
  Lists, per contributing card, the engine name + tier + strength and its `conditions`; renders `AnalysisTabs` below; a "Place paper trade" button **disabled** when any contributing card is `validation_state==='research'` (the accumulation gate).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/SignalDetailDrawer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/components/analysis/AnalysisTabs', () => ({ AnalysisTabs: () => <div>analysis</div> }));
import { SignalDetailDrawer } from '@/components/signals/SignalDetailDrawer';
import type { SignalCardData } from '@/types/signals-board';

const card = (over: Partial<SignalCardData>): SignalCardData => ({
    source: 'SMART_MONEY', family: 'accumulation', symbol: 'NABIL', direction: 'BUY',
    strength: 88, tier: 'Platinum Buy', entry_price: '520', stop_loss_price: '500',
    target_price: '560', conditions: ['4 smart-money brokers clustered near cost'],
    validation_state: null, freshness_date: '2026-06-15', strategy_name: 'Smart money', rationale: '', ...over });

describe('SignalDetailDrawer', () => {
    it('lists each engine and its conditions', () => {
        render(<SignalDetailDrawer symbol="NABIL" open cards={[card({})]} onClose={vi.fn()} />);
        expect(screen.getByText('Smart money')).toBeInTheDocument();
        expect(screen.getByText(/4 smart-money brokers/)).toBeInTheDocument();
    });
    it('disables paper trade when a contributing card is research-only', () => {
        render(<SignalDetailDrawer symbol="NABIL" open onClose={vi.fn()}
            cards={[card({ source: 'ACCUMULATION_STRATEGY', validation_state: 'research', strategy_name: 'Accumulation strategy' })]} />);
        expect(screen.getByRole('button', { name: /place paper trade/i })).toBeDisabled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalDetailDrawer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/signals/SignalDetailDrawer.tsx
'use client';

import { AnalysisTabs } from '@/components/analysis/AnalysisTabs';
import { Button } from '@/components/ui/button';
import { num } from '@/lib/numbers';
import type { SignalCardData } from '@/types/signals-board';

interface Props { symbol: string; cards: SignalCardData[]; open: boolean; onClose: () => void; }

function EngineBlock({ card }: { card: SignalCardData }) {
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1.5">
                <span className="font-semibold text-sm">{card.strategy_name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{card.tier} · {card.strength ?? 0}</span>
            </div>
            <ul className="flex flex-col gap-1">
                {card.conditions.map((c, i) => (
                    <li key={i} className="text-xs text-muted-foreground pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-ring">{c}</li>
                ))}
            </ul>
        </div>
    );
}

export function SignalDetailDrawer({ symbol, cards, open, onClose }: Props) {
    if (!open) return null;
    const lead = cards[0];
    const tradeable = !cards.some((c) => c.validation_state === 'research');
    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
            <aside className="fixed top-0 right-0 h-full w-[min(440px,94vw)] bg-background border-l border-border z-50 flex flex-col" aria-label={`${symbol} detail`}>
                <div className="flex items-start gap-3 p-5 border-b border-border">
                    <span className="text-xl font-bold tracking-tight">{symbol}</span>
                    <button className="ml-auto text-muted-foreground" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className="flex flex-col gap-3 p-5 overflow-auto">
                    <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground">Why this fired</h3>
                    {cards.map((c, i) => <EngineBlock key={i} card={c} />)}
                    <AnalysisTabs symbol={symbol} ladder={{
                        cmp: num(lead.entry_price), entry: num(lead.entry_price),
                        stopLoss: num(lead.stop_loss_price) || undefined,
                        tp1: num(lead.target_price) || undefined, direction: lead.direction }} />
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1">Add to watchlist</Button>
                        <Button className="flex-1" disabled={!tradeable}>Place paper trade</Button>
                    </div>
                </div>
            </aside>
        </>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalDetailDrawer.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/signals/SignalDetailDrawer.tsx frontend/src/__tests__/unit/SignalDetailDrawer.test.tsx
git commit -m "feat(signals): why-it-fired detail drawer with per-engine conditions"
```

---

### Task 9: SignalLane

**Files:**
- Create: `frontend/src/components/signals/SignalLane.tsx`
- Test: `frontend/src/__tests__/unit/SignalLane.test.tsx`

**Interfaces:**
- Consumes: `SignalCard` (T7), `SignalCardData`, `BoardResponse['consensus']`, `Glossary`.
- Produces: `<SignalLane title={string} cards={SignalCardData[]} consensus={...} glossary={Glossary|null} onOpen={...} />`.
  Header with title, count, buy⇄sell skew bar; ranked cards; an empty state when no cards.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/SignalLane.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SignalLane } from '@/components/signals/SignalLane';

describe('SignalLane', () => {
    it('shows the count and an empty state', () => {
        render(<SignalLane title="Accumulation" cards={[]} consensus={{}} glossary={null} onOpen={vi.fn()} />);
        expect(screen.getByText('Accumulation')).toBeInTheDocument();
        expect(screen.getByText('0')).toBeInTheDocument();
        expect(screen.getByText(/no .* signals/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalLane.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/signals/SignalLane.tsx
'use client';

import { SignalCard } from './SignalCard';
import type { BoardResponse, Glossary, SignalCardData } from '@/types/signals-board';

interface Props {
    title: string;
    cards: SignalCardData[];
    consensus: BoardResponse['consensus'];
    glossary: Glossary | null;
    onOpen: (card: SignalCardData) => void;
}

export function SignalLane({ title, cards, consensus, glossary, onOpen }: Props) {
    const buys = cards.filter((c) => c.direction === 'BUY').length;
    const skew = cards.length ? Math.round((buys / cards.length) * 100) : 0;
    return (
        <section className="flex flex-col rounded-xl border border-border bg-card/40 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
                <span className="font-semibold tracking-tight">{title}</span>
                <span className="text-xs text-muted-foreground rounded-full border border-border px-2 tabular-nums">{cards.length}</span>
                <span className="ml-auto h-1.5 w-16 rounded-full bg-rose-500/30 overflow-hidden" title={`${buys} buy`}>
                    <span className="block h-full bg-emerald-500" style={{ width: `${skew}%` }} /></span>
            </div>
            <div className="flex flex-col gap-2.5 px-3 pb-4">
                {cards.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-6">No {title.toLowerCase()} signals today.</p>
                    : cards.map((c, i) => (
                        <SignalCard key={`${c.source}-${c.symbol}-${i}`} card={c} glossary={glossary}
                            consensusCount={consensus[c.symbol]?.count ?? 1} onOpen={onOpen} />))}
            </div>
        </section>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalLane.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/signals/SignalLane.tsx frontend/src/__tests__/unit/SignalLane.test.tsx
git commit -m "feat(signals): SignalLane (header, skew, ranked cards, empty state)"
```

---

### Task 10: SignalsBoard page + route swap + delete old UIs

**Files:**
- Create: `frontend/src/components/signals/SignalsBoard.tsx`
- Modify: `frontend/src/app/(authenticated)/signals/page.tsx` (render `SignalsBoard`)
- Delete: `frontend/src/app/(authenticated)/signals/IntelHubClient.tsx`, `frontend/src/app/(authenticated)/signals/SignalsPageClient.tsx`
- Test: `frontend/src/__tests__/unit/SignalsBoard.test.tsx`

**Interfaces:**
- Consumes: `signalsApi` (T5), `SignalLane` (T9), `SignalDetailDrawer` (T8), `FAMILIES`, `DashboardLayout`, `StockLoader`.
- Produces: `<SignalsBoard />` — fetches board + glossary on mount, renders posture strip + filter bar + three lanes + drawer.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/SignalsBoard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('@/components/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/analysis/AnalysisTabs', () => ({ AnalysisTabs: () => <div>analysis</div> }));
vi.mock('@/lib/api', () => ({
    __esModule: true, default: { get: vi.fn() },
    signalsApi: {
        board: vi.fn().mockResolvedValue({ data: { cards: [
            { source:'SMART_MONEY', family:'accumulation', symbol:'NABIL', direction:'BUY', strength:88, tier:'Platinum Buy', entry_price:'520', stop_loss_price:'500', target_price:'560', conditions:[], validation_state:null, freshness_date:'2026-06-15', strategy_name:'Smart money', rationale:'' },
        ], consensus: { NABIL: { families:['accumulation'], count:1 } } } }),
        glossary: vi.fn().mockResolvedValue({ data: { sources:{}, tiers:{}, terms:{} } }),
    },
}));
import SignalsBoard from '@/components/signals/SignalsBoard';

describe('SignalsBoard', () => {
    afterEach(() => vi.clearAllMocks());
    it('renders the three lanes and a fetched card', async () => {
        render(<SignalsBoard />);
        await waitFor(() => expect(screen.getByText('NABIL')).toBeInTheDocument());
        expect(screen.getByText('Accumulation')).toBeInTheDocument();
        expect(screen.getByText('Technical')).toBeInTheDocument();
        expect(screen.getByText('Your strategies')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalsBoard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3a: SignalsBoard**

```tsx
// frontend/src/components/signals/SignalsBoard.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { PageLoader } from '@/components/ui/StockLoader';
import { SignalLane } from './SignalLane';
import { SignalDetailDrawer } from './SignalDetailDrawer';
import { signalsApi } from '@/lib/api';
import type { BoardResponse, Glossary, SignalCardData } from '@/types/signals-board';

const LANES: { key: SignalCardData['family']; title: string }[] = [
    { key: 'accumulation', title: 'Accumulation' },
    { key: 'technical', title: 'Technical' },
    { key: 'your_strategies', title: 'Your strategies' },
];

export default function SignalsBoard() {
    const [board, setBoard] = useState<BoardResponse | null>(null);
    const [glossary, setGlossary] = useState<Glossary | null>(null);
    const [open, setOpen] = useState<SignalCardData | null>(null);

    useEffect(() => {
        signalsApi.board().then((r) => setBoard(r.data)).catch(() => setBoard({ cards: [], consensus: {} }));
        signalsApi.glossary().then((r) => setGlossary(r.data)).catch(() => setGlossary(null));
    }, []);

    const drawerCards = useMemo(
        () => board && open ? board.cards.filter((c) => c.symbol === open.symbol && c.direction === open.direction) : [],
        [board, open]);

    if (!board) return <DashboardLayout title="Signals"><PageLoader /></DashboardLayout>;

    return (
        <DashboardLayout title="Signals">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                {LANES.map((lane) => (
                    <SignalLane key={lane.key} title={lane.title} glossary={glossary} consensus={board.consensus}
                        cards={board.cards.filter((c) => c.family === lane.key)} onOpen={setOpen} />))}
            </div>
            <SignalDetailDrawer symbol={open?.symbol ?? ''} cards={drawerCards} open={!!open} onClose={() => setOpen(null)} />
        </DashboardLayout>
    );
}
```

- [ ] **Step 3b: Swap the route + delete the old UIs**

Replace `frontend/src/app/(authenticated)/signals/page.tsx` body to render `SignalsBoard`:

```tsx
import { Suspense } from 'react';
import SignalsBoard from '@/components/signals/SignalsBoard';
import DashboardLayout from '@/components/DashboardLayout';
import { PageLoader } from '@/components/ui/StockLoader';

export const dynamic = 'force-dynamic';

export default function SignalsPage() {
    return (
        <Suspense fallback={<DashboardLayout title="Signals"><PageLoader /></DashboardLayout>}>
            <SignalsBoard />
        </Suspense>
    );
}
```

Then delete the replaced files:

```bash
git rm frontend/src/app/\(authenticated\)/signals/IntelHubClient.tsx frontend/src/app/\(authenticated\)/signals/SignalsPageClient.tsx
```

(If either is imported elsewhere, grep first: `grep -rn "IntelHubClient\|SignalsPageClient" frontend/src` — remove dead imports.)

- [ ] **Step 4: Run test + build to verify**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalsBoard.test.tsx && npm run lint`
Expected: test PASS; lint clean (no references to the deleted files).

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/components/signals frontend/src/app/\(authenticated\)/signals
git commit -m "feat(signals): unified board page; remove legacy SignalsPageClient + IntelHubClient"
```

---

### Task 11: Posture strip + global filters

**Files:**
- Modify: `frontend/src/components/signals/SignalsBoard.tsx` (add strip + filter bar; re-fetch on filter change)
- Test: `frontend/src/__tests__/unit/SignalsBoardFilters.test.tsx`

**Interfaces:**
- Consumes: `signalsApi.board(params)`.
- Produces: posture strip (net buy/sell counts) + filter bar (direction all/buy/sell, symbol search, min families 1/2/3); changing a filter calls `signalsApi.board` with the params.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/SignalsBoardFilters.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('@/components/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/analysis/AnalysisTabs', () => ({ AnalysisTabs: () => <div>analysis</div> }));
const board = vi.fn().mockResolvedValue({ data: { cards: [], consensus: {} } });
vi.mock('@/lib/api', () => ({ __esModule: true, default: { get: vi.fn() },
    signalsApi: { board: (...a: unknown[]) => board(...a), glossary: vi.fn().mockResolvedValue({ data: { sources:{}, tiers:{}, terms:{} } }) } }));
import SignalsBoard from '@/components/signals/SignalsBoard';

describe('SignalsBoard filters', () => {
    afterEach(() => vi.clearAllMocks());
    it('re-fetches the board with a direction filter', async () => {
        render(<SignalsBoard />);
        await waitFor(() => expect(board).toHaveBeenCalled());
        fireEvent.click(screen.getByRole('button', { name: /^buy$/i }));
        await waitFor(() => expect(board).toHaveBeenLastCalledWith({ direction: 'BUY' }));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalsBoardFilters.test.tsx`
Expected: FAIL — no direction buttons / board not re-called with params.

- [ ] **Step 3: Add the strip + filters to SignalsBoard**

Replace the `useEffect` + return in `SignalsBoard.tsx` with a filter-aware version:

```tsx
    const [filters, setFilters] = useState<{ direction?: string; min_families?: string }>({});

    useEffect(() => {
        const params: Record<string, string> = {};
        if (filters.direction) params.direction = filters.direction;
        if (filters.min_families) params.min_families = filters.min_families;
        signalsApi.board(params).then((r) => setBoard(r.data)).catch(() => setBoard({ cards: [], consensus: {} }));
    }, [filters]);

    useEffect(() => { signalsApi.glossary().then((r) => setGlossary(r.data)).catch(() => setGlossary(null)); }, []);
```

Add, above the lanes grid, a posture strip + a direction segmented control:

```tsx
    const buys = board?.cards.filter((c) => c.direction === 'BUY').length ?? 0;
    const sells = (board?.cards.length ?? 0) - buys;
    // ...in the returned JSX, before the lanes grid:
    <div className="flex items-center gap-4 flex-wrap pt-2 pb-3">
        <p className="text-sm text-muted-foreground tabular-nums">{buys} bullish · {sells} bearish</p>
        <div className="ml-auto inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Direction">
            {[['', 'All'], ['BUY', 'Buy'], ['SELL', 'Sell']].map(([val, label]) => (
                <button key={label} onClick={() => setFilters((f) => ({ ...f, direction: val || undefined }))}
                    aria-pressed={(filters.direction ?? '') === val}
                    className={`px-3 py-1.5 text-xs ${(filters.direction ?? '') === val ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>{label}</button>))}
        </div>
    </div>
```

(Keep the lanes grid + drawer from Task 10 below this strip.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalsBoardFilters.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/signals/SignalsBoard.tsx frontend/src/__tests__/unit/SignalsBoardFilters.test.tsx
git commit -m "feat(signals): posture strip + direction/min-families filters"
```

---

### Task 12: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Backend signals suite**

Run: `docker-compose exec -T backend pytest stocks/tests/test_signal_families.py stocks/tests/test_signal_glossary.py stocks/tests/test_signal_conditions.py stocks/tests/test_signal_board.py -v`
Expected: all PASS.

- [ ] **Step 2: Signal-generation regression** (board must not break existing signal endpoints)

Run: `docker-compose exec -T backend pytest stocks/tests/ -k "signal" -q`
Expected: PASS (no regressions in existing signal tests).

- [ ] **Step 3: Frontend signals suite + lint**

Run: `cd frontend && npx vitest run src/__tests__/unit/signalsApi.test.ts src/__tests__/unit/SignalsAtoms.test.tsx src/__tests__/unit/SignalCard.test.tsx src/__tests__/unit/SignalDetailDrawer.test.tsx src/__tests__/unit/SignalLane.test.tsx src/__tests__/unit/SignalsBoard.test.tsx src/__tests__/unit/SignalsBoardFilters.test.tsx && npm run lint`
Expected: all PASS; lint clean; no references to deleted `IntelHubClient`/`SignalsPageClient`.

- [ ] **Step 4: Build the frontend** (the route swap + deletes must compile)

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Smoke the board against real data** (after deploy: backend restart + frontend rebuild)

Run: `docker-compose exec -T backend python -c "import json; from django.test import Client; print(Client().get('/api/stocks/signals/board/').status_code)"`
Expected: `200`.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A && git commit -m "test(signals): end-to-end verification fixes" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- Three family lanes → Tasks 1 (map), 9 (lane), 10 (board page). ✅
- Cross-family consensus → Task 4 (`_consensus`) + Task 7 (chip) + Task 9 (count). ✅
- Why-it-fired drawer with per-engine conditions → Task 3 (formatter) + Task 8 (drawer). ✅
- Hover glossary → Task 2 (glossary+endpoint) + Task 6 (GlossaryTooltip) + used in Task 7. ✅
- Board endpoint merging episodes + USER_STRATEGY + AccumulationCandidate → Task 4. ✅
- Accumulation-trading candidates in Accumulation lane, score→strength, validation_state→tier, factor conditions, research disables trade → Task 4 (`_candidate_card`) + Task 8 (gated button). ✅
- Theme-bound visual system, conviction neutral fill, neutral consensus chip → Tasks 6/7 (bg-foreground meter, bg-ring/border chip). ✅
- Posture strip + filters → Task 11. ✅
- Replace both old UIs → Task 10 (delete + route swap). ✅
- Reuse AnalysisTabs/StockLoader/lib/numbers/shadcn → Tasks 8/10. ✅
- Track-record restyle → noted as future polish (the route is untouched, still works); not blocking the board.

**2. Placeholder scan:** No TBD/TODO; every code step has real code. Task 11 edits an existing component — the snippet shows the exact replacement blocks.

**3. Type consistency:** `SignalCardData` fields match the board endpoint card dict (Task 4 ↔ Task 5). `family` values (`accumulation`/`technical`/`your_strategies`) consistent across Tasks 1/5/10. `signalsApi.board/glossary` signatures consistent (Tasks 5/10/11). `GlossaryEntry`/`Glossary` consistent (Tasks 2/5/6/7). `AccumulationCandidate.factors` keys (`concentration`/`coiling`/`breakout`/`score`) match Task 3 formatter ↔ Task 4 ↔ the real scanner.

**Known integration notes for the implementer:**
- Task 4: confirm `SignalEpisode` test rows accept the fields used (the model requires `producer_key`); the test sets it.
- Task 10: `PageLoader` is exported from `@/components/ui/StockLoader` (verify the named export; the current page used a `RefreshCw` fallback — either works).
- Track-record sub-route is intentionally left intact (separate, still-working view); a restyle is follow-up, not part of this plan.

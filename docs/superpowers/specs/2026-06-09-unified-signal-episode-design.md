# Unified Signal Episode Model — Design

**Date:** 2026-06-09
**Status:** Approved for planning
**Scope:** Replace the two parallel signal stores (`StrategySignal`, `GeneratedSignal`) with one episode/interval model, re-derived from price data.

---

## 1. Problem

Trading signals are a **piecewise-constant time series**: a producer (a user strategy or an engine) recommends the same directional stance for long stretches and only matters when it changes. The codebase stores this two incompatible ways:

- **`StrategySignal`** (`backend/stocks/models/strategy.py:93`) — dense daily snapshot, one row per `(strategy, symbol, date)`. A 10-day BUY run = 10 rows. No concept of a run. The `tracking()` action reconstructs runs by walking dense rows and pairing BUY→SELL.
- **`GeneratedSignal`** (`backend/stocks/models/system.py:111`) — episode-with-lifecycle (`status` ACTIVE→WON/LOST, `target_price`, `stop_loss_price`, `closed_date`, `pnl_percent`), but keyed daily by `(source, symbol, generated_date)`, so the same run can spawn many overlapping positions.

### Concrete bugs this causes

The `tracking()` reconstruction in `backend/stocks/views/strategy.py` (~line 1032) is wrong *because* runs were never stored as runs:

1. **Wrong entry.** It does `current_buy = sig` on every BUY day, so a 10-day BUY run records the **last** BUY (day 10) as entry, not day 1 when the signal fired. Entry price and `days_held` come from the wrong end of the run.
2. **Calendar days, not trading days.** `days_held = (sell_date - buy_date).days` counts weekends/holidays.
3. **Overlapping positions.** `GeneratedSignal` can hold N simultaneous ACTIVE positions for one symbol/source — there is nothing preventing it.

These are not independent bugs; they are symptoms of the missing run/episode abstraction.

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Scope | **Unify** both models into one episodic model (source of truth for user-strategy *and* engine signals). |
| Migration | **Re-derive from price data** — drop & rebuild signal tables via backfill. No in-place data migration. |
| Episode unit | **Compressed directional run that carries a trade outcome.** One row per run (`start`/`end`), but a run can be closed early by a TP/SL hit. |
| What closes an episode | **TP/SL hit** (primary outcome) **or** an **opposite-signal flip** (structural — can't be long and short at once). |
| Re-entry after TP/SL | **No immediate re-entry.** A new run opens only on a rising edge (a flip into the direction). A flat-then-refire with no opposite signal in between is the *same* run. |
| Daily recommendation series | **Derive on demand** (forward-fill from episodes). No daily rows stored. |

---

## 3. Data model: `SignalEpisode`

Replaces both `StrategySignal` and `GeneratedSignal`.

```python
class SignalEpisode(models.Model):
    # ---- Producer ----
    source       = CharField(max_length=30)          # 'SMART_MONEY', 'BROKER_ACCUMULATION', ... or 'USER_STRATEGY'
    strategy     = ForeignKey(Strategy, null=True, blank=True, on_delete=CASCADE)  # set iff source == 'USER_STRATEGY'
    producer_key = CharField(max_length=64, db_index=True)  # NON-NULL identity: source, or f'{source}:{strategy_id}'
    symbol       = CharField(max_length=20, db_index=True)
    direction    = CharField(max_length=4)           # 'BUY' | 'SELL'

    # ---- Run window ----
    start_date       = DateField()
    end_date         = DateField(null=True, blank=True)   # null == ACTIVE / still open
    last_signal_date = DateField()                        # last day producer re-affirmed direction

    # ---- Entry + plan (set once, at open) ----
    entry_price     = DecimalField(max_digits=10, decimal_places=2)
    target_price    = DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stop_loss_price = DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    entry_strength  = FloatField(default=0)
    signal_tier     = CharField(max_length=50, blank=True, default='')

    # ---- Outcome (set at close) ----
    status        = CharField(max_length=20, default='ACTIVE')  # ACTIVE|WON|LOST|FLIPPED|CLOSED_MANUAL
    exit_price    = DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    exit_reason   = CharField(max_length=20, null=True, blank=True)  # TARGET|STOP|SIGNAL_FLIP|MANUAL
    pnl_percent   = DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    peak_strength = FloatField(default=0)

    rationale  = TextField(blank=True, default='')
    metadata   = JSONField(default=dict, blank=True)   # entry-time indicators, reasons
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=['producer_key', 'symbol'],
                condition=Q(end_date__isnull=True),
                name='one_open_episode_per_producer_symbol',
            ),
        ]
        indexes = [
            Index(fields=['source', 'start_date']),
            Index(fields=['symbol', 'start_date']),
            Index(fields=['producer_key', 'symbol']),
            Index(fields=['status']),
        ]
        ordering = ['-start_date']
```

### Design points

- **Partial unique index is the structural fix.** "At most one open episode per `(producer_key, symbol)`" makes overlapping duplicate positions *impossible at the DB level*.
- **`producer_key` must be non-null.** Postgres treats `NULL`s as distinct in unique indexes, so a constraint over the nullable `strategy` FK would *not* prevent two open `(SMART_MONEY, NULL, NABIL)` rows — the exact overlap bug. `producer_key` is a non-null derived string set on save: `source` for engines (e.g. `'SMART_MONEY'`), `f'{source}:{strategy_id}'` for user strategies (e.g. `'USER_STRATEGY:7'`). The `source` + `strategy` FK are kept for querying/joins; `producer_key` is purely the uniqueness/lookup key.
- **Producer identity** = `source` string + optional `strategy` FK. Engines: `strategy=null`, `source='SMART_MONEY'` etc. User strategies: `source='USER_STRATEGY'`, `strategy=<FK>`. Rejected seeding a `Strategy` row per engine (conflates user strategies with system engines; YAGNI).
- **`days_held` is trading days** — count of `DailyStockPrice` rows in `[start_date, end_date]` (or `[start_date, today]` if open). Fixes the calendar-day bug. Exposed as a serializer/property, not stored.
- **`status` values:** `WON`/`LOST` = closed by target/stop; `FLIPPED` = closed by opposite signal; `CLOSED_MANUAL` = user override; `ACTIVE` = open.

---

## 4. Lifecycle state machine

Two independent steps, run daily and replayed over history during backfill. `HOLD` and `NEUTRAL` readings mean "maintain, no action" — only `BUY`/`SELL` act.

### A. Signal step (per producer × symbol, given today's reading `D`)

```
open = SignalEpisode for (producer_key, symbol) WHERE end_date IS NULL   # ≤1 by constraint
if open exists:
    if open.direction == D:
        extend(open)                       # update last_signal_date, peak_strength = max(...)
    else:                                  # opposite signal
        close(open, reason=SIGNAL_FLIP, status=FLIPPED, exit_price=today_close, end_date=today)
        open_new(direction=D)
else:
    latest = most recent SignalEpisode for (producer_key, symbol) by start_date  # open or closed
    if latest and latest.direction == D and latest.exit_reason in (TARGET, STOP):
        pass                               # same run already consumed by TP/SL → NO re-entry
    else:
        open_new(direction=D)
```

`open_new` sets `start_date=last_signal_date=today`, `entry_price=today_close`, `target_price`/`stop_loss_price` from the producer's plan, `entry_strength`, `signal_tier`, `rationale`, `metadata`, `status=ACTIVE`.

**Key invariant:** a new run opens *only* on a rising edge — a flip into the direction (or first-ever signal). A long HOLD/NEUTRAL/flat stretch followed by the same direction re-firing, with no opposite signal in between, is the **same run** and does not re-enter. *(Confirmed with user.)*

### B. Evaluation step (per ACTIVE episode)

Port of the existing `evaluate_signals` command, retargeted at `SignalEpisode`:

```
for ep in SignalEpisode.objects.filter(status='ACTIVE'):
    prices = DailyStockPrice for ep.symbol WHERE date > ep.start_date   # day AFTER entry
    walk chronologically; first TP/SL hit closes:
        BUY:  high >= target -> WON(exit=target); low  <= stop -> LOST(exit=stop)
        SELL: low  <= target -> WON(exit=target); high >= stop -> LOST(exit=stop)
    on close: set status, end_date=hit_date, exit_price, exit_reason (TARGET|STOP),
              pnl_percent (BUY: (exit-entry)/entry; SELL: (entry-exit)/entry)
```

**Fix vs current code:** evaluation starts the day **after** `start_date`. Today's entry is the day's close, so the same bar's high/low must not be allowed to hit the target (look-ahead bias). The current `evaluate_signals` uses `date__gte=generated_date`, which can falsely trigger same-day.

**Ordering within a day (backfill):** run Signal step A first (open/extend/flip using today's close), then Evaluation step B starts from the next day — so an episode opened today is never closed today.

---

## 5. Generation & backfill

- **Backfill command** (`rebuild_signal_episodes`): for each producer × symbol, replay history day-by-day running step A then B, holding only the current episode in memory, emitting compressed episodes. Reuses existing per-date reading logic (engine `execute_history` and `StrategyService.generate_signals_for_symbol` already compute a reading for any date).
- **Daily incremental**: same two steps for today only, reading the latest episode from the DB. Replaces the write paths in `StrategyService.generate_all_signals` and `SignalGenerationService.generate_all` / `_persist_signals`.

---

## 6. API & `tracking()` rewrite

- **`tracking()`** collapses from the ~120-line stateful pairing loop to queries:
  - active positions = `SignalEpisode.objects.filter(status='ACTIVE')`
  - closed positions = `status__in=[WON, LOST, FLIPPED, CLOSED_MANUAL]`
  - The buggy "last BUY before a sell" pairing and calendar-day math are **deleted**. `days_held` = trading-day count.
- **`performance` / `track_record` / `summary`** aggregate over `SignalEpisode` grouped by `source` and `status` — simpler, since outcome is a column.
- **Daily band for charts**: helper `episodes_to_daily(symbol, source, from, to)` forward-fills episodes into a per-day series at request time. No stored daily rows.

---

## 7. Migration & cutover

Re-derive ⇒ drop and rebuild. Steps:

1. Add `SignalEpisode` model + migration.
2. Drop `StrategySignal` and `GeneratedSignal` (migration).
3. Run `rebuild_signal_episodes` backfill.

Consumers to update (exact files):

| File | Change |
|---|---|
| `backend/stocks/models/strategy.py` | remove `StrategySignal` |
| `backend/stocks/models/system.py` | remove `GeneratedSignal`; add `SignalEpisode` (or new `models/signal.py`) |
| `backend/stocks/serializers/strategy.py` | remove `StrategySignalSerializer` |
| `backend/stocks/serializers/system.py` | remove `GeneratedSignalSerializer`; add `SignalEpisodeSerializer` |
| `backend/stocks/views/strategy.py` | rewrite `StrategySignalViewSet`/`GeneratedSignalViewSet` → `SignalEpisodeViewSet`; rewrite `tracking`, `performance`, `track_record`, `summary` |
| `backend/stocks/views/recommendations.py` | engine `execute_history` writes episodes via step A/B instead of dense rows |
| `backend/stocks/services/strategy_service.py` | `generate_*` writes episodes |
| `backend/stocks/services/signal_generation_service.py` | `_persist_signals` → episode step A; TP/SL plan calc stays |
| `backend/stocks/management/commands/evaluate_signals.py` | retarget to `SignalEpisode`, fix entry-day off-by-one |
| `backend/stocks/management/commands/generate_all_signals.py` | orchestrate new generation + eval |
| `backend/stocks/urls.py` | route updates |
| `backend/stocks/admin/strategy.py` | admin for `SignalEpisode` |
| `frontend/src/components/SignalDashboard.tsx` + signal-intel/track-record pages | consume episode shape |

---

## 8. Testing (TDD)

The Signal step is pure logic over a `date → reading` sequence — unit-testable without the DB.

- 10-day BUY run → **1** episode (`start=day1`, `last_signal_date=day10`).
- BUY run, flip to SELL day 11 → BUY episode closed `FLIPPED` day 11, SELL episode opened day 11.
- BUY run, TP hits day 4, signal persists BUY days 5–10 → episode `WON` day 4, **no re-entry**.
- TP-closed BUY, then SELL appears, then BUY re-fires → new BUY run opens (rising edge).
- HOLD/NEUTRAL between BUY days maintains the run (no new episode, no close).
- Entry day is **not** evaluated for TP/SL (look-ahead guard).
- DB constraint: inserting a 2nd open episode for the same `(producer_key, symbol)` raises IntegrityError — including the engine case (`strategy=NULL`), which a constraint over the nullable FK would miss.
- `days_held` counts trading days (gaps over weekends don't inflate).

Evaluation step: BUY/SELL target & stop hit detection, conservative exit price, P&L sign.

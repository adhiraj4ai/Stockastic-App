"""Execution scope for strategy code — the one place exec() globals are built.

Faithfully reproduces the most complete pre-existing scope builder,
``StrategyViewSet._get_bt_local_scope`` in ``stocks/views/strategy.py`` (which
registers ``pandas_ta`` in ``sys.modules`` so that ``import pandas_ta as ta`` in
strategy code resolves to the talib-backed adapter), plus the special-code
mapping and class-extraction heuristic that were duplicated elsewhere.
"""

import sys
import inspect

import numpy as np
import pandas as pd
import talib
from backtesting import Backtest, Strategy as BTStrategy
from backtesting.lib import crossover, resample_apply
from backtesting.test import SMA

# Canonical SafeTa lives in optimization_service; re-export so callers can get it
# from the harness without reaching across the codebase.
from ..optimization_service import SafeTa

__all__ = ["build_strategy_scope", "extract_strategy_class", "resolve_code", "SafeTa"]


# ---------------------------------------------------------------------------
# Special "code" identifiers that map to a fixed class source. These are stored
# in the Strategy.code field as short tokens instead of Python source. Mapping
# was previously copy-pasted in verify_all_strategies.py and views/strategy.py.
# ---------------------------------------------------------------------------
_BROKER_ACCUMULATION_SRC = """
from backtesting import Strategy
import numpy as np
import pandas as pd
from stocks.models import DailyCumulativeAccumulation

class BrokerAccumulationStrategy(Strategy):
    def init(self):
        ticker = symbol
        qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker).values('transaction_date', 'cumulative_net')
        if not qs:
            self.acc = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        daily = df.groupby('transaction_date')['cumulative_net'].sum()
        self.acc = self.I(lambda x: daily.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)

    def next(self):
        if len(self.acc) < 2: return
        if self.acc[-1] > 0 and self.acc[-2] <= 0:
            if not self.position: self.buy()
        elif self.acc[-1] < 0 and self.acc[-2] >= 0:
            if self.position: self.position.close()
"""

_ICHIMOKU_ACCUMULATION_SRC = """
from backtesting import Strategy
import pandas as pd
import numpy as np
import pandas_ta as ta
from stocks.models import DailyCumulativeAccumulation

class IchimokuAccumulation(Strategy):
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        ichimoku_df = ta.ichimoku(high, low, close)[0]
        self.span_a = self.I(lambda: ichimoku_df.iloc[:, 2].values)
        self.span_b = self.I(lambda: ichimoku_df.iloc[:, 3].values)

        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'cumulative_net')
        if not qs:
            self.acc = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        daily = df.groupby('transaction_date')['cumulative_net'].sum()
        self.acc = self.I(lambda x: daily.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)

    def next(self):
        price = self.data.Close[-1]
        above_cloud = price > self.span_a[-1] and price > self.span_b[-1]
        accumulating = self.acc[-1] > 0
        if above_cloud and accumulating:
            if not self.position: self.buy()
        elif price < self.span_a[-1] or price < self.span_b[-1]:
            if self.position: self.position.close()
"""

_SMART_ACCUMULATED_CROSSOVER_SRC = """
from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd
import numpy as np
import pandas_ta as ta
from stocks.models import DailyCumulativeAccumulation

class SmartAccumulatedCrossover(Strategy):
    fast = 10
    slow = 50

    def init(self):
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self.fast_ma = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            self.slow_ma = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        pivot = df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net', aggfunc='last').ffill().fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(5).index
        flow = pivot[top].sum(axis=1)
        line = self.I(lambda x: flow.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)
        self.fast_ma = self.I(lambda x: pd.Series(x).rolling(self.fast).mean().values, line)
        self.slow_ma = self.I(lambda x: pd.Series(x).rolling(self.slow).mean().values, line)

    def next(self):
        if crossover(self.fast_ma, self.slow_ma):
            if not self.position: self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            if self.position: self.position.close()
"""

SPECIAL_CODE_SOURCES = {
    "broker_accumulation_v1": _BROKER_ACCUMULATION_SRC,
    "ichimoku_accumulation_v1": _ICHIMOKU_ACCUMULATION_SRC,
    "smart_accumulated_crossover_v1": _SMART_ACCUMULATED_CROSSOVER_SRC,
}


def resolve_code(code):
    """Map a Strategy.code value to runnable Python source.

    Accepts either a raw code string or one of the special tokens. The
    ``ichimoku_accumulation_v1`` token historically appeared with a suffix
    (``startswith`` match), so we honour that here too.
    """
    if not isinstance(code, str):
        return code
    if code in SPECIAL_CODE_SOURCES:
        return SPECIAL_CODE_SOURCES[code]
    if code.startswith("ichimoku_accumulation_v1"):
        return SPECIAL_CODE_SOURCES["ichimoku_accumulation_v1"]
    return code


def build_strategy_scope(symbol, params=None):
    """Build the exec() globals dict for running a strategy's code.

    Mirrors ``StrategyViewSet._get_bt_local_scope``: a single ``ta`` adapter
    (talib-backed) also registered as the ``pandas_ta`` module so that strategy
    code written against either API works.
    """
    ta_adapter = SafeTa(talib)
    # Make `import pandas_ta as ta` resolve to our talib-backed adapter.
    sys.modules["pandas_ta"] = ta_adapter  # type: ignore[assignment]

    scope = {
        # backtesting.py core
        "Strategy": BTStrategy,
        "Backtest": Backtest,
        "crossover": crossover,
        "resample_apply": resample_apply,
        "SMA": SMA,
        # TA — single `ta` variable covers both pandas_ta and talib usage
        "ta": ta_adapter,
        "talib": talib,
        # Data science
        "np": np,
        "pd": pd,
        # Context
        "symbol": symbol,
    }
    if params:
        scope.update(params)
    return scope


def extract_strategy_class(scope):
    """Return the backtesting.Strategy subclass defined in an exec'd scope.

    First-match semantics, matching the production behaviour in
    ``views/strategy.py`` and ``strategy_service.py``. Returns None if absent.
    """
    for obj in scope.values():
        if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
            return obj
    return None

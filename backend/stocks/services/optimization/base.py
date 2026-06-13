from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import pandas as pd


@dataclass
class OptimizationResult:
    weight_map: dict[str, float]
    metrics: dict[str, float]
    note: str


@runtime_checkable
class IPortfolioOptimizer(Protocol):
    methods: tuple[str, ...]

    def optimize(
        self, returns: pd.DataFrame, df_pivoted: pd.DataFrame
    ) -> OptimizationResult: ...

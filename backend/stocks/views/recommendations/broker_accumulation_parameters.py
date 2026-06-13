"""
BrokerAccumulationParameters dataclass — configuration for the broker engine.
"""
from dataclasses import dataclass, field
from typing import Dict


@dataclass
class BrokerAccumulationParameters:
    min_accumulation_days: int = 10
    volume_breakout_threshold: float = 2.0
    price_breakout_threshold: float = 0.02
    rsi_oversold: int = 30
    rsi_overbought: int = 70
    min_buyer_percentage: float = 60.0
    lookback_period: int = 200
    min_net_volume: int = 10000
    window_days: int = 10
    momentum_rsi_lower: int = 30
    momentum_rsi_upper: int = 70
    confidence_thresholds: Dict[str, float] = field(default_factory=lambda: {
        'strong_buy': 75.0,
        'buy': 50.0
    })

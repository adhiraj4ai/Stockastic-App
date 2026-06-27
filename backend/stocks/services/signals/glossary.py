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

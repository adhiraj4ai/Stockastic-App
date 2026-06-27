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

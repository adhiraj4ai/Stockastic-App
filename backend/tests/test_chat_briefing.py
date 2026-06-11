from types import SimpleNamespace

from chat.briefing import render_plan_briefing


def _plan(picks=None, watch=None, catalysts=None, breadth=0.24):
    payload = {"as_of": "2026-06-10", "picks": picks or [], "watch": watch or [],
               "exits": [], "catalysts": catalysts or [], "market_context": {}}
    return SimpleNamespace(date="2026-06-11", regime="RISK_OFF", breadth=breadth, payload=payload)


def test_renders_picks_watch_catalysts():
    pick = {"symbol": "SHL", "confluence_score": 81, "direction": "BUY",
            "entry": {"price": 600.0, "zone_low": 590.0, "zone_high": 612.0,
                      "status": "IN_ZONE", "last_signal_age_days": 1, "latest_close": 601.0},
            "targets": {"tp1": 640.0, "sl": 585.0},
            "analog": {"n": 14, "fwd_3d_median_pct": 2.1, "win_rate_3d": 0.64,
                       "fwd_1d_median_pct": 0.8, "fwd_5d_median_pct": 2.9},
            "catalyst": None, "components": {"engine_agreement": {"active_buy_sources": ["A"], "conflicting_sources": []},
                                              "opportunity": {"trust": None}, "accumulation": {}, "sector": {}}}
    watch_item = {**pick, "symbol": "GVL", "confluence_score": 72,
                  "entry": {**pick["entry"], "status": "EXTENDED"}}
    cat = {"symbol": "NABIL", "type": "BOOK_CLOSE", "date": "2026-06-18", "days_away": 7, "detail": "bonus 10%"}
    text = render_plan_briefing(_plan(picks=[pick], watch=[watch_item], catalysts=[cat]))
    assert "SHL" in text and "81" in text
    assert "GVL" in text
    assert "NABIL" in text and "book close" in text.lower()
    assert "24%" in text  # breadth


def test_empty_plan_honest():
    text = render_plan_briefing(_plan())
    assert "no qualifying setups" in text.lower()

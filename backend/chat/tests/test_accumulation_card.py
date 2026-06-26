from chat.tools.market import _series_from_rows


def test_series_from_rows_preserves_ascending_order():
    rows = [
        {"transaction_date": "2026-06-01", "net": 10.0},
        {"transaction_date": "2026-06-02", "net": -5.0},
        {"transaction_date": "2026-06-03", "net": 20.5},
    ]
    series = _series_from_rows(rows)
    assert [s["date"] for s in series] == ["2026-06-01", "2026-06-02", "2026-06-03"]


def test_series_from_rows_produces_str_date_and_float_net():
    rows = [{"transaction_date": "2026-06-01", "net": 42}]
    series = _series_from_rows(rows)
    assert len(series) == 1
    assert isinstance(series[0]["date"], str)
    assert isinstance(series[0]["net"], float)
    assert series[0]["net"] == 42.0


def test_series_from_rows_handles_none_net():
    rows = [{"transaction_date": "2026-06-01", "net": None}]
    series = _series_from_rows(rows)
    assert series[0]["net"] == 0.0


def test_series_from_rows_empty():
    assert _series_from_rows([]) == []

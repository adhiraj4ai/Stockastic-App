from chat.history import extract_tickers


def test_extracts_uppercase_symbols():
    assert extract_tickers("What about NMB and ADBL?") == ["NMB", "ADBL"]


def test_drops_metric_acronym_stopwords():
    assert extract_tickers("Show me the RSI and MACD for EBL") == ["EBL"]


def test_dedupes_preserving_first_order():
    assert extract_tickers("NMB is good. Buy NMB now, vs ADBL.") == ["NMB", "ADBL"]


def test_ignores_lowercase_and_short_tokens():
    assert extract_tickers("is it ok to buy at npr 100") == []


def test_empty_or_none_text():
    assert extract_tickers("") == []
    assert extract_tickers(None) == []

from stocks.services.tearsheet.session import build_endpoint, extract_fsk


def test_extract_fsk_finds_token():
    url = "https://nepsealpha.com/sastoshare/tearsheet/filter/financials?fsk=Gnw21LX9&symbol=API"
    assert extract_fsk(url) == "Gnw21LX9"


def test_extract_fsk_missing_returns_none():
    assert extract_fsk("https://nepsealpha.com/x?symbol=API") is None


def test_build_endpoint_orders_params():
    url = build_endpoint(
        "https://nepsealpha.com",
        "/sastoshare/tearsheet/filter/financials",
        {"symbol": "API", "fsk": "TOK"},
    )
    assert url == (
        "https://nepsealpha.com/sastoshare/tearsheet/filter/financials"
        "?symbol=API&fsk=TOK"
    )

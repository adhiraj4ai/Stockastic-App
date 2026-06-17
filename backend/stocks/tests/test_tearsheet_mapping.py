import json
import os

from stocks.services.tearsheet.mapping import (
    PARTICULAR_TO_PATH,
    SCALAR_PARTICULARS,
)

FIXTURE = os.path.join(
    os.path.dirname(__file__), "fixtures", "tearsheet", "api_financials.json"
)


def test_every_fixture_particular_is_mapped():
    rows = json.load(open(FIXTURE))
    particulars = {r["particular"] for r in rows}
    unmapped = particulars - set(PARTICULAR_TO_PATH)
    assert unmapped == set(), f"unmapped particulars: {unmapped}"


def test_share_capital_maps_to_liabilities_and_scalar():
    assert PARTICULAR_TO_PATH["ShareCapital"] == (
        "balance_sheet", "LIABILITIES", "share_capital")
    assert SCALAR_PARTICULARS["ShareCapital"] == "paid_up_capital"


def test_net_profit_maps_to_pl_and_scalar():
    assert PARTICULAR_TO_PATH["ProfitForTheYear(NetProfit)"] == (
        "profit_loss", "PL", "net_profit")
    assert SCALAR_PARTICULARS["ProfitForTheYear(NetProfit)"] == "net_profit"

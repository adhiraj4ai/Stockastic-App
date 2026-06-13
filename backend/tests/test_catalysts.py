import pytest
from datetime import date
from stocks.services.catalysts import upcoming_catalysts


@pytest.mark.django_db
class TestUpcomingCatalysts:
    def test_book_close_within_window(self):
        from stocks.models import Dividend
        Dividend.objects.create(ticker="NABIL", fiscal_year="2082/83",
                                bonus_percent=10, cash_percent=5, total_percent=15,
                                book_close_date=date(2026, 6, 18))
        Dividend.objects.create(ticker="OLD", fiscal_year="2081/82",
                                total_percent=10, book_close_date=date(2026, 1, 1))
        out = upcoming_catalysts(as_of=date(2026, 6, 12), horizon_days=14)
        assert len(out) == 1
        c = out[0]
        assert c["symbol"] == "NABIL"
        assert c["type"] == "BOOK_CLOSE"
        assert c["date"] == "2026-06-18"
        assert c["days_away"] == 6
        assert "10" in c["detail"]  # bonus pct mentioned

    def test_dividend_announcement(self):
        from stocks.models import FinancialReport
        FinancialReport.objects.create(ticker="NICA", fiscal_year="2082/83",
                                       report_type="ANNUAL",
                                       dividend_announced_date=date(2026, 6, 15))
        out = upcoming_catalysts(as_of=date(2026, 6, 12), horizon_days=14)
        assert any(c["symbol"] == "NICA" and c["type"] == "DIVIDEND_ANNOUNCED" for c in out)

    def test_sorted_by_date(self):
        from stocks.models import Dividend
        Dividend.objects.create(ticker="B", fiscal_year="x", total_percent=1,
                                book_close_date=date(2026, 6, 20))
        Dividend.objects.create(ticker="A", fiscal_year="x", total_percent=1,
                                book_close_date=date(2026, 6, 14))
        out = upcoming_catalysts(as_of=date(2026, 6, 12), horizon_days=14)
        assert [c["symbol"] for c in out] == ["A", "B"]

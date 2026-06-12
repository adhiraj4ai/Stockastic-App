from django.contrib.auth import get_user_model
from django.test import TestCase

from chat.models import ChatSession, SavedAnalysis
from chat.services.saved_match import match_saved_analyses

User = get_user_model()


class SavedAnalysisModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="x")
        self.session = ChatSession.objects.create(user=self.user, title="GBIME Q2")

    def test_create_and_defaults(self):
        sa = SavedAnalysis.objects.create(
            user=self.user,
            session=self.session,
            title="GBIME Q2 Fundamentals",
            summary="EPS up, NPL flat.",
            one_liner="Q2 FY81 — EPS up, NPL flat",
            category="Quarterly Fundamentals",
            tags=["q2-fy81", "fundamentals"],
            tickers=["GBIME"],
            series_key="GBIME · Quarterly Fundamentals",
        )
        self.assertEqual(sa.user, self.user)
        self.assertEqual(sa.tags, ["q2-fy81", "fundamentals"])
        self.assertEqual(sa.structured, {})
        self.assertEqual(sa.verdict, "")

    def test_session_set_null_on_chat_delete(self):
        sa = SavedAnalysis.objects.create(
            user=self.user, session=self.session, title="t", summary="s",
        )
        self.session.delete()
        sa.refresh_from_db()
        self.assertIsNone(sa.session)

    def test_ordering_newest_first(self):
        a = SavedAnalysis.objects.create(user=self.user, title="a", summary="s")
        b = SavedAnalysis.objects.create(user=self.user, title="b", summary="s")
        self.assertEqual(list(SavedAnalysis.objects.all()), [b, a])


class SavedMatchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="x")
        SavedAnalysis.objects.create(
            user=self.user, title="GBIME Quarterly Fundamentals",
            summary="EPS and NPL review.", one_liner="GBIME Q2",
            tags=["fundamentals", "q2"], tickers=["GBIME"],
        )
        SavedAnalysis.objects.create(
            user=self.user, title="NABIL Technical Setup",
            summary="RSI and MACD.", one_liner="NABIL TA",
            tags=["technical"], tickers=["NABIL"],
        )

    def test_ranks_ticker_match_first(self):
        results = match_saved_analyses(self.user, "how are GBIME fundamentals this quarter")
        self.assertTrue(results)
        self.assertEqual(results[0].tickers, ["GBIME"])

    def test_matches_lowercase_ticker(self):
        results = match_saved_analyses(self.user, "how is gbime doing this quarter")
        self.assertTrue(results)
        self.assertEqual(results[0].tickers, ["GBIME"])

    def test_empty_query_returns_empty(self):
        self.assertEqual(match_saved_analyses(self.user, "   "), [])

    def test_scopes_to_user(self):
        other = User.objects.create_user(username="carol", password="x")
        self.assertEqual(match_saved_analyses(other, "GBIME fundamentals"), [])

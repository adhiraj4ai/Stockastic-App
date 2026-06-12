from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from chat.models import ChatMessage, ChatSession, SavedAnalysis
from chat.serializers import SavedAnalysisListSerializer, SavedAnalysisSerializer
from chat.services import analysis_capture
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


class BuildDraftTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="dave", password="x")
        self.session = ChatSession.objects.create(user=self.user, title="GBIME deep dive")
        ChatMessage.objects.create(
            session=self.session, role=ChatMessage.ROLE_USER,
            text="Give me a fundamental analysis of GBIME for Q2.",
        )
        ChatMessage.objects.create(
            session=self.session, role=ChatMessage.ROLE_ASSISTANT,
            text="GBIME shows EPS growth and stable NPL.",
            blocks=[
                {"kind": "text", "text": "GBIME shows EPS growth and stable NPL."},
                {"kind": "card", "type": "ticker_verdict",
                 "data": {"symbol": "GBIME", "verdict": "BUY", "confluence_score": 72}},
            ],
        )

    def test_captures_structured_verdict(self):
        with patch.object(analysis_capture, "_summarize_llm", return_value=None):
            draft = analysis_capture.build_draft(self.session)
        self.assertEqual(draft["verdict"], "BUY")
        self.assertEqual(draft["structured"].get("symbol"), "GBIME")
        self.assertIn("GBIME", draft["tickers"])
        self.assertTrue(draft["degraded"])  # LLM returned nothing -> naive fallback

    def test_verdict_truncated_to_field_limit(self):
        # A verdict longer than SavedAnalysis.verdict's max_length (16) must be capped.
        self.session.messages.filter(role="assistant").update(
            blocks=[{"kind": "card", "type": "signal",
                     "data": {"symbol": "GBIME", "verdict": "STRONG_BUY_CONVICTION"}}]
        )
        with patch.object(analysis_capture, "_summarize_llm", return_value=None):
            draft = analysis_capture.build_draft(self.session)
        self.assertLessEqual(len(draft["verdict"]), 16)

    def test_later_card_without_verdict_does_not_wipe(self):
        ChatMessage.objects.create(
            session=self.session, role=ChatMessage.ROLE_ASSISTANT,
            text="follow-up",
            blocks=[{"kind": "card", "type": "signal", "data": {"symbol": "GBIME"}}],
        )
        with patch.object(analysis_capture, "_summarize_llm", return_value=None):
            draft = analysis_capture.build_draft(self.session)
        self.assertEqual(draft["verdict"], "BUY")

    def test_naive_tickers_skip_stopwords(self):
        self.assertEqual(
            analysis_capture._extract_tickers("BUY NABIL for the long term, EPS strong"),
            ["NABIL"],
        )

    def test_uses_llm_draft_when_available(self):
        fake = {
            "title": "GBIME Q2 Fundamentals",
            "summary": "Detailed synthesis.",
            "one_liner": "GBIME Q2 — strong",
            "category": "Quarterly Fundamentals",
            "tags": ["fundamentals", "q2"],
            "tickers": ["GBIME"],
        }
        with patch.object(analysis_capture, "_summarize_llm", return_value=fake):
            draft = analysis_capture.build_draft(self.session)
        self.assertEqual(draft["title"], "GBIME Q2 Fundamentals")
        self.assertEqual(draft["category"], "Quarterly Fundamentals")
        self.assertFalse(draft["degraded"])
        self.assertEqual(draft["series_key"], "GBIME · Quarterly Fundamentals")
        self.assertEqual(draft["verdict"], "BUY")  # still captured from blocks


class SavedAnalysisSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="erin", password="x")

    def test_full_serializer_roundtrip(self):
        data = {
            "title": "GBIME Q2", "summary": "body", "one_liner": "ol",
            "category": "Quarterly Fundamentals", "tags": ["q2"], "tickers": ["GBIME"],
            "series_key": "GBIME · Quarterly Fundamentals",
        }
        ser = SavedAnalysisSerializer(data=data)
        self.assertTrue(ser.is_valid(), ser.errors)
        obj = ser.save(user=self.user)
        self.assertEqual(obj.title, "GBIME Q2")
        self.assertEqual(obj.user, self.user)

    def test_list_serializer_omits_summary(self):
        obj = SavedAnalysis.objects.create(
            user=self.user, title="t", summary="long body", one_liner="ol",
        )
        out = SavedAnalysisListSerializer(obj).data
        self.assertNotIn("summary", out)
        self.assertIn("one_liner", out)

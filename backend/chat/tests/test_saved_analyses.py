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


from rest_framework.test import APITestCase


class SavedAnalysisAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="fred", password="x")
        self.other = User.objects.create_user(username="gina", password="x")
        self.client.force_authenticate(self.user)
        self.session = ChatSession.objects.create(user=self.user, title="GBIME chat")

    def test_create_and_list_owner_scoped(self):
        resp = self.client.post("/api/chat/saved/", {
            "title": "GBIME Q2", "summary": "body", "one_liner": "ol",
            "category": "Quarterly Fundamentals", "tags": ["q2"], "tickers": ["GBIME"],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        listing = self.client.get("/api/chat/saved/")
        self.assertEqual(len(listing.data), 1)
        self.assertNotIn("summary", listing.data[0])
        self.client.force_authenticate(self.other)
        self.assertEqual(len(self.client.get("/api/chat/saved/").data), 0)

    def test_create_rejects_foreign_session(self):
        foreign = ChatSession.objects.create(user=self.other, title="theirs")
        resp = self.client.post("/api/chat/saved/", {
            "title": "x", "summary": "b", "session": str(foreign.id),
        }, format="json")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_suggest_lexical(self):
        SavedAnalysis.objects.create(
            user=self.user, title="GBIME Quarterly Fundamentals",
            summary="s", one_liner="GBIME Q2", tags=["fundamentals"], tickers=["GBIME"],
        )
        resp = self.client.get("/api/chat/saved/suggest/", {"q": "GBIME fundamentals"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertNotIn("summary", resp.data[0])

    def test_bookmark_draft_calls_capture(self):
        fake = {
            "title": "GBIME Q2", "summary": "body", "one_liner": "ol",
            "category": "Quarterly Fundamentals", "tags": ["q2"], "tickers": ["GBIME"],
            "series_key": "GBIME · Quarterly Fundamentals", "verdict": "BUY",
            "structured": {"symbol": "GBIME"}, "degraded": False,
        }
        with patch("chat.views.build_draft", return_value=fake) as m:
            resp = self.client.post(f"/api/chat/sessions/{self.session.id}/bookmark_draft/")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["title"], "GBIME Q2")
        m.assert_called_once()

    def test_bookmark_draft_rejects_foreign_session(self):
        foreign = ChatSession.objects.create(user=self.other, title="x")
        resp = self.client.post(f"/api/chat/sessions/{foreign.id}/bookmark_draft/")
        self.assertEqual(resp.status_code, 404)


import asyncio

from django.test import TransactionTestCase

from chat import _user_context
from chat.tools import search_saved_analyses, get_saved_analysis


class SavedAnalysisToolTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="hank", password="x")
        self.sa = SavedAnalysis.objects.create(
            user=self.user, title="GBIME Quarterly Fundamentals",
            summary="Full frozen synthesis here.", one_liner="GBIME Q2",
            category="Quarterly Fundamentals", tags=["fundamentals"], tickers=["GBIME"],
            series_key="GBIME · Quarterly Fundamentals", verdict="BUY",
        )

    def _run(self, coro):
        _user_context.set_user(self.user)
        return asyncio.run(coro)

    def test_search_returns_catalog(self):
        result = self._run(search_saved_analyses.handler({"ticker": "GBIME"}))
        self.assertFalse(result["is_error"])
        self.assertIn("GBIME", result["content"][0]["text"])

    def test_get_returns_full_summary(self):
        result = self._run(get_saved_analysis.handler({"id": str(self.sa.id)}))
        self.assertFalse(result["is_error"])
        self.assertIn("Full frozen synthesis", result["content"][0]["text"])

    def test_get_rejects_foreign_id(self):
        other = User.objects.create_user(username="ida", password="x")
        foreign = SavedAnalysis.objects.create(user=other, title="x", summary="secret body")
        result = self._run(get_saved_analysis.handler({"id": str(foreign.id)}))
        self.assertTrue(result["is_error"])
        self.assertNotIn("secret body", result["content"][0]["text"])


class SubagentGrantTests(TestCase):
    def test_analysis_agents_have_recall_tools(self):
        from chat.subagents import (
            MARKET_ANALYST, STOCK_ANALYST, BUY_SELL_STRATEGIST,
            PORTFOLIO_ADVISOR, BROKER_INTELLIGENCE, PORTFOLIO_MANAGER,
        )
        from chat.tools import tool_id
        search = tool_id("search_saved_analyses")
        get = tool_id("get_saved_analysis")
        for agent in (MARKET_ANALYST, STOCK_ANALYST, BUY_SELL_STRATEGIST,
                      PORTFOLIO_ADVISOR, BROKER_INTELLIGENCE):
            self.assertIn(search, agent.tools)
            self.assertIn(get, agent.tools)
        # Portfolio manager (acts, not analyzes) is intentionally excluded.
        self.assertNotIn(search, PORTFOLIO_MANAGER.tools)

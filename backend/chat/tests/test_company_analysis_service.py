import pytest
from django.contrib.auth import get_user_model

from chat import summary_service
from chat.history import Exchange
from chat.models import CompanyAnalysisEntry
from chat.summary_service import _parse_analysis, build_company_analysis, CompanyAnalysisResult

User = get_user_model()

VALID_JSON = (
    '{"materially_changed": true, "summary": "NMB looks strong on Q3 earnings.", '
    '"stance": "bullish", "aspect": "fundamental", "change_note": "Q3 beat flipped the thesis bullish."}'
)


def test_parse_valid_json_no_prior():
    result = _parse_analysis(VALID_JSON, None)
    assert result.materially_changed is True
    assert result.summary == "NMB looks strong on Q3 earnings."
    assert result.stance == "bullish"
    assert result.aspect == "fundamental"
    assert "Q3 beat" in result.change_note


def test_parse_strips_json_fences():
    fenced = "```json\n" + VALID_JSON + "\n```"
    result = _parse_analysis(fenced, None)
    assert result.stance == "bullish"


def test_parse_malformed_falls_back_to_prior(db):
    user = User.objects.create(username="bob")
    prior = CompanyAnalysisEntry.objects.create(
        user=user, symbol="NMB", summary="prior text", stance="bearish", aspect="technical"
    )
    result = _parse_analysis("not json at all", prior)
    assert result.materially_changed is False
    assert result.summary == "prior text"
    assert result.stance == "bearish"
    assert result.aspect == "technical"
    assert result.change_note == ""


def test_parse_invalid_enum_falls_back_to_neutral_no_prior():
    bad = '{"materially_changed": true, "summary": "x", "stance": "WILD", "aspect": "both", "change_note": "y"}'
    result = _parse_analysis(bad, None)
    assert result.materially_changed is False
    assert result.stance == CompanyAnalysisEntry.STANCE_NEUTRAL
    assert result.aspect == CompanyAnalysisEntry.ASPECT_BOTH


def test_parse_null_summary_falls_back():
    null_summary = '{"materially_changed": true, "summary": null, "stance": "bullish", "aspect": "both", "change_note": "y"}'
    result = _parse_analysis(null_summary, None)
    assert result.materially_changed is False
    assert result.summary == ""


def test_parse_none_text_falls_back():
    result = _parse_analysis(None, None)
    assert result.materially_changed is False
    assert result.summary == ""


def test_parse_truncates_summary_and_change_note():
    long = (
        '{"materially_changed": true, "summary": "'
        + "s" * 5000
        + '", "stance": "bullish", "aspect": "both", "change_note": "'
        + "c" * 500
        + '"}'
    )
    result = _parse_analysis(long, None)
    assert len(result.summary) == summary_service.MAX_COMPANY_SUMMARY_CHARS
    assert len(result.change_note) == summary_service.MAX_CHANGE_NOTE_CHARS


def test_build_company_analysis_uses_run_summary(monkeypatch):
    captured = {}

    async def fake_run(prompt, system):
        captured["prompt"] = prompt
        return VALID_JSON

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    result = build_company_analysis(None, [Exchange("How is NMB?", "Great Q3.")], "NMB")
    assert isinstance(result, CompanyAnalysisResult)
    assert result.stance == "bullish"
    assert "NMB" in captured["prompt"]
    assert "How is NMB?" in captured["prompt"]


def test_summarize_verdict_compact_and_defensive():
    from chat.summary_service import _summarize_verdict
    verdict = {
        "confluence_score": 72,
        "entry": {"status": "ACTIVE", "latest_close": 410},
        "targets": {"tp1": 460, "sl": 380},
        "episodes": [{"x": 1}, {"x": 2}],
        "catalyst": {"type": "earnings"},
    }
    text = _summarize_verdict(verdict)
    assert "72" in text
    assert "2 active" in text
    # tolerates empties without raising
    assert _summarize_verdict({}) != ""
    assert _summarize_verdict(None) != ""


def test_build_from_market_parses_and_includes_context(monkeypatch):
    from chat import summary_service
    from chat.summary_service import build_company_analysis_from_market, CompanyAnalysisResult

    captured = {}

    async def fake_run(prompt, system):
        captured["prompt"] = prompt
        return (
            '{"materially_changed": true, "summary": "Momentum improving.", '
            '"stance": "bullish", "aspect": "technical", "change_note": "Score rose."}'
        )

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    verdict = {"confluence_score": 80, "episodes": []}
    result = build_company_analysis_from_market(None, "NMB", verdict)
    assert isinstance(result, CompanyAnalysisResult)
    assert result.stance == "bullish"
    assert result.aspect == "technical"
    assert "NMB" in captured["prompt"]
    assert "80" in captured["prompt"]

from chat.history import Exchange
from chat import summary_service
from chat.summary_service import _summary_prompt, build_summary, MAX_SUMMARY_CHARS


def test_prompt_includes_prior_summary_and_new_exchange():
    ex = Exchange(user_text="Is NABIL a buy?", assistant_text="Yes, strong fundamentals.")
    prompt = _summary_prompt("Earlier we discussed SHIVM.", ex)
    assert "Earlier we discussed SHIVM." in prompt
    assert "Is NABIL a buy?" in prompt
    assert "Yes, strong fundamentals." in prompt


def test_prompt_handles_empty_prior_summary():
    ex = Exchange(user_text="q", assistant_text="a")
    prompt = _summary_prompt("", ex)
    assert "(no prior summary)" in prompt


def test_build_summary_truncates_to_max(monkeypatch):
    async def fake_run(_prompt):
        return "y" * (MAX_SUMMARY_CHARS + 100)

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    out = build_summary("prior", Exchange(user_text="q", assistant_text="a"))
    assert len(out) == MAX_SUMMARY_CHARS


def test_build_summary_falls_back_to_prior_when_model_returns_empty(monkeypatch):
    async def fake_run(_prompt):
        return "   "

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    out = build_summary("prior summary", Exchange(user_text="q", assistant_text="a"))
    assert out == "prior summary"

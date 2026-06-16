from chat import summary_service
from chat.history import Exchange


def test_build_company_summary_folds_exchange(monkeypatch):
    captured = {}

    async def fake_run(prompt, system):
        captured["prompt"] = prompt
        captured["system"] = system
        return "NMB notes updated"

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    out = summary_service.build_company_summary(
        "", [Exchange("How is NMB doing?", "Strong fundamentals.")], "NMB"
    )
    assert out == "NMB notes updated"
    assert "NMB" in captured["prompt"]
    assert "How is NMB doing?" in captured["prompt"]


def test_build_company_summary_falls_back_on_empty(monkeypatch):
    async def fake_run(prompt, system):
        return "   "

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    out = summary_service.build_company_summary(
        "prior NMB notes", [Exchange("q", "a")], "NMB"
    )
    assert out == "prior NMB notes"

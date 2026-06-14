from types import SimpleNamespace

from chat.agent import _format_prompt


def _user():
    return SimpleNamespace(username="alice")


def test_renders_summary_and_history_sections():
    out = _format_prompt(
        _user(), "Why?",
        memory=[], saved_hint="",
        summary="We discussed NABIL; verdict was buy.",
        history="User: Is NABIL a buy?\nAssistant: Yes.",
    )
    assert "[Conversation summary]" in out
    assert "We discussed NABIL; verdict was buy." in out
    assert "[Recent conversation]" in out
    assert "User: Is NABIL a buy?" in out
    assert "Why?" in out


def test_empty_summary_and_history_show_placeholders():
    out = _format_prompt(_user(), "Hi", memory=[], saved_hint="", summary="", history="")
    assert "(no earlier conversation summarized yet)" in out
    assert "(the user's message does not reference earlier turns)" in out

from chat.analysis_seed import seed_entry_fields, SEED_CHANGE_NOTE


def test_returns_fields_for_non_blank_summary():
    fields = seed_entry_fields("Strong bank, accumulating.")
    assert fields == {
        "summary": "Strong bank, accumulating.",
        "stance": "neutral",
        "aspect": "both",
        "change_note": SEED_CHANGE_NOTE,
    }


def test_returns_none_for_blank_summary():
    assert seed_entry_fields("") is None
    assert seed_entry_fields("   ") is None
    assert seed_entry_fields(None) is None

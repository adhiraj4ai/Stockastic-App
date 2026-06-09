"""Unit tests for pure, side-effect-free functions in chat.streaming."""
import json
from unittest.mock import Mock

import pytest

from chat.streaming import _content_text, _is_subagent, _sse


class TestSseEncoder:
    def test_produces_correct_wire_format(self):
        frame = _sse("text", {"text": "Hello"})
        assert frame == b'event: text\ndata: {"text": "Hello"}\n\n'

    def test_terminates_with_blank_line(self):
        frame = _sse("done", {})
        assert frame.endswith(b"\n\n")

    def test_event_name_on_first_line(self):
        frame = _sse("assistant_start", {}).decode()
        lines = frame.split("\n")
        assert lines[0] == "event: assistant_start"

    def test_data_line_contains_valid_json(self):
        payload = {"type": "stock_card", "data": {"ticker": "NABIL", "ltp": 1250.0}}
        frame = _sse("card", payload).decode()
        data_line = next(l for l in frame.split("\n") if l.startswith("data:"))
        parsed = json.loads(data_line[len("data:"):].strip())
        assert parsed == payload

    def test_encodes_unicode_without_ascii_escaping(self):
        frame = _sse("text", {"text": "नमस्ते"})
        assert "नमस्ते".encode("utf-8") in frame

    def test_non_serializable_value_uses_str_fallback(self):
        import uuid
        uid = uuid.uuid4()
        frame = _sse("done", {"session_id": uid}).decode()
        assert str(uid) in frame

    def test_nested_payload_preserved(self):
        payload = {"kind": "tool_use", "tool": "get_stock_quote", "input": {"ticker": "SCB"}, "id": "tu_01"}
        frame = _sse("tool_use", payload)
        data = json.loads(frame.decode().split("\n")[1][5:])
        assert data["input"]["ticker"] == "SCB"


class TestContentText:
    def test_none_returns_empty_string(self):
        assert _content_text(None) == ""

    def test_plain_string_returns_unchanged(self):
        assert _content_text("RSI is oversold at 28") == "RSI is oversold at 28"

    def test_list_of_text_dicts_joined_by_newline(self):
        content = [{"type": "text", "text": "Line 1"}, {"type": "text", "text": "Line 2"}]
        result = _content_text(content)
        assert "Line 1" in result
        assert "Line 2" in result
        assert result == "Line 1\nLine 2"

    def test_non_text_dict_in_list_serialized_as_json(self):
        content = [{"type": "image_url", "url": "http://example.com/chart.png"}]
        result = _content_text(content)
        assert "image_url" in result

    def test_mixed_list_text_and_non_text(self):
        content = [
            {"type": "text", "text": "Summary: "},
            {"type": "data", "values": [1, 2, 3]},
        ]
        result = _content_text(content)
        assert "Summary: " in result
        assert "data" in result

    def test_list_of_plain_strings_joined(self):
        result = _content_text(["part1", "part2"])
        assert "part1" in result
        assert "part2" in result

    def test_integer_coerced_to_string(self):
        assert _content_text(42) == "42"

    def test_empty_list_returns_empty_string(self):
        assert _content_text([]) == ""


class TestIsSubagent:
    def test_true_when_parent_tool_use_id_is_set(self):
        msg = Mock()
        msg.parent_tool_use_id = "toolu_01XYZ"
        assert _is_subagent(msg) is True

    def test_false_when_parent_tool_use_id_is_empty_string(self):
        msg = Mock()
        msg.parent_tool_use_id = ""
        assert _is_subagent(msg) is False

    def test_false_when_parent_tool_use_id_is_none(self):
        msg = Mock()
        msg.parent_tool_use_id = None
        assert _is_subagent(msg) is False

    def test_false_when_attribute_is_absent(self):
        msg = Mock(spec=[])  # no attributes
        assert _is_subagent(msg) is False

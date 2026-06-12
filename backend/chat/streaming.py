"""SSE adapter for the Stockastic chat agent.

Wraps :func:`chat.agent.run_chat_session` and converts the Claude Agent SDK
message stream into a Server-Sent Events byte stream the Next.js frontend
can consume.

Frame format::

    event: <kind>
    data: <json>
    \n

Frame kinds:
    assistant_start   — beginning of an assistant turn (model + parent info)
    subagent_start    — the orchestrator delegated to a subagent
    text              — chunk of assistant text (subagent or orchestrator)
    thinking          — summarized reasoning chunk
    tool_use          — a tool call started
    tool_result       — a tool call returned (text only; cards arrive separately)
    card              — structured render payload (one per tool that emitted one)
    subagent_end      — the subagent's Task finished and control returned
    assistant_end     — the entire assistant turn finished
    usage             — token/cost metadata
    done              — final terminator (carries session_id)
    error             — terminal error
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator

from asgiref.sync import sync_to_async
from claude_agent_sdk import (
    AssistantMessage,
    ResultMessage,
    StreamEvent,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

from . import _user_context
from .agent import run_chat_session
from .models import ChatMessage, ChatSession

log = logging.getLogger(__name__)


def _sse(event: str, payload: dict) -> bytes:
    """Encode one SSE frame."""
    data = json.dumps(payload, default=str, ensure_ascii=False)
    return f"event: {event}\ndata: {data}\n\n".encode("utf-8")


def _content_text(content) -> str:
    """Extract plain text from a ToolResultBlock.content value."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    parts.append(item.get("text", ""))
                else:
                    parts.append(json.dumps(item, default=str))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content)


def _is_subagent(msg: AssistantMessage | UserMessage) -> bool:
    """An AssistantMessage from a subagent carries a parent_tool_use_id."""
    return bool(getattr(msg, "parent_tool_use_id", None))


async def stream_chat(
    *, user, session: ChatSession, prompt: str
) -> AsyncIterator[bytes]:
    """Stream one assistant turn over SSE and persist the assistant message at end."""

    _user_context.reset_cards()
    blocks: list[dict] = []  # full structured transcript to persist
    seen_subagents: set[str] = set()  # parent_tool_use_ids we've announced
    final_session_id: str | None = session.sdk_session_id or None
    usage_total = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
    }

    yield _sse("assistant_start", {"session_id": str(session.id)})

    try:
        async for msg in run_chat_session(
            user=user, sdk_session_id=session.sdk_session_id, prompt=prompt
        ):
            # Token-level deltas: incrementally stream assistant text/thinking as it
            # is generated. The final AssistantMessage (below) carries the same content
            # in whole — we persist from there but DON'T re-yield it, to avoid doubling.
            if isinstance(msg, StreamEvent):
                ev = msg.event or {}
                etype = ev.get("type")
                parent = getattr(msg, "parent_tool_use_id", None)
                sub = "subagent" if parent else None

                if etype == "message_start" and parent and parent not in seen_subagents:
                    seen_subagents.add(parent)
                    payload = {
                        "kind": "subagent_start",
                        "parent": parent,
                        "model": (ev.get("message") or {}).get("model"),
                    }
                    blocks.append(payload)
                    yield _sse("subagent_start", payload)

                elif etype == "content_block_delta":
                    delta = ev.get("delta") or {}
                    if delta.get("type") == "text_delta" and delta.get("text"):
                        yield _sse("text", {"kind": "text", "subagent": sub, "text": delta["text"]})
                    elif delta.get("type") == "thinking_delta" and delta.get("thinking"):
                        yield _sse("thinking", {"kind": "thinking", "subagent": sub, "text": delta["thinking"]})
                continue

            if isinstance(msg, AssistantMessage):
                if msg.session_id:
                    final_session_id = msg.session_id

                if msg.usage:
                    for k in usage_total:
                        usage_total[k] += int(msg.usage.get(k, 0) or 0)

                subagent_marker = "subagent" if _is_subagent(msg) else None
                if _is_subagent(msg) and msg.parent_tool_use_id not in seen_subagents:
                    seen_subagents.add(msg.parent_tool_use_id)
                    payload = {
                        "kind": "subagent_start",
                        "parent": msg.parent_tool_use_id,
                        "model": msg.model,
                    }
                    blocks.append(payload)
                    yield _sse("subagent_start", payload)

                for block in msg.content:
                    # Text/thinking already streamed live via StreamEvent deltas; here we
                    # only record them for persistence (so reloads show the full turn).
                    if isinstance(block, TextBlock):
                        blocks.append({"kind": "text", "subagent": subagent_marker, "text": block.text})

                    elif isinstance(block, ThinkingBlock):
                        blocks.append({"kind": "thinking", "subagent": subagent_marker, "text": block.thinking})

                    elif isinstance(block, ToolUseBlock):
                        # Drain any cards left over from a prior tool — shouldn't
                        # happen but defensive.
                        _user_context.take_cards()
                        payload = {
                            "kind": "tool_use",
                            "subagent": subagent_marker,
                            "tool": block.name,
                            "input": block.input,
                            "id": block.id,
                        }
                        blocks.append(payload)
                        yield _sse("tool_use", payload)

                    elif isinstance(block, ToolResultBlock):
                        text = _content_text(block.content)
                        payload = {
                            "kind": "tool_result",
                            "subagent": subagent_marker,
                            "id": block.tool_use_id,
                            "is_error": bool(block.is_error),
                            "text": text,
                        }
                        blocks.append(payload)
                        yield _sse("tool_result", payload)

                        # Emit any cards that the tool pushed into the buffer.
                        for card in _user_context.take_cards():
                            card_payload = {
                                "kind": "card",
                                "type": card.get("type"),
                                "data": card.get("data"),
                                "tool": card.get("tool"),
                            }
                            blocks.append(card_payload)
                            yield _sse("card", card_payload)

            elif isinstance(msg, UserMessage):
                subagent_marker = "subagent" if _is_subagent(msg) else None
                for block in msg.content:
                    if isinstance(block, ToolResultBlock):
                        text = _content_text(block.content)
                        payload = {
                            "kind": "tool_result",
                            "subagent": subagent_marker,
                            "id": block.tool_use_id,
                            "is_error": bool(block.is_error),
                            "text": text,
                        }
                        blocks.append(payload)
                        yield _sse("tool_result", payload)

                        # Emit any cards that the tool pushed into the buffer.
                        for card in _user_context.take_cards():
                            card_payload = {
                                "kind": "card",
                                "type": card.get("type"),
                                "data": card.get("data"),
                                "tool": card.get("tool"),
                            }
                            blocks.append(card_payload)
                            yield _sse("card", card_payload)

            elif isinstance(msg, SystemMessage):
                # init/setup messages; not user-facing.
                pass

            elif isinstance(msg, ResultMessage):
                if msg.session_id:
                    final_session_id = msg.session_id
                if msg.usage:
                    for k in usage_total:
                        usage_total[k] += int(msg.usage.get(k, 0) or 0)
                yield _sse(
                    "usage",
                    {
                        "input_tokens": usage_total["input_tokens"],
                        "output_tokens": usage_total["output_tokens"],
                        "cache_read_input_tokens": usage_total["cache_read_input_tokens"],
                        "cache_creation_input_tokens": usage_total["cache_creation_input_tokens"],
                        "cost_usd": msg.total_cost_usd,
                        "duration_ms": msg.duration_ms,
                    },
                )

        yield _sse("assistant_end", {})

    except Exception as exc:  # pylint: disable=broad-except
        import uuid as _uuid
        error_id = _uuid.uuid4().hex[:8]
        log.exception("chat stream error [%s]", error_id)
        # Generic client-facing message; details stay server-side under error_id.
        yield _sse("error", {"message": f"An internal error occurred (ref {error_id})."})

    # Persist the assistant turn — collect joined text for the .text column.
    joined_text = "\n".join(
        b["text"] for b in blocks if b.get("kind") == "text" and b.get("text")
    )

    @sync_to_async
    def _persist():
        msg = ChatMessage.objects.create(
            session=session,
            role=ChatMessage.ROLE_ASSISTANT,
            text=joined_text,
            blocks=blocks,
            input_tokens=usage_total["input_tokens"],
            output_tokens=usage_total["output_tokens"],
            cache_read_tokens=usage_total["cache_read_input_tokens"],
            cache_creation_tokens=usage_total["cache_creation_input_tokens"],
        )
        if final_session_id and session.sdk_session_id != final_session_id:
            session.sdk_session_id = final_session_id
            session.save(update_fields=["sdk_session_id", "updated_at"])
        else:
            # Touch updated_at so the session moves to the top of the sidebar.
            session.save(update_fields=["updated_at"])
        return str(msg.id)

    persisted_message_id = None
    try:
        persisted_message_id = await _persist()
    except Exception:  # pylint: disable=broad-except
        log.exception("failed to persist assistant turn")

    yield _sse("done", {
        "session_id": str(session.id),
        "sdk_session_id": final_session_id,
        "message_id": persisted_message_id,
    })

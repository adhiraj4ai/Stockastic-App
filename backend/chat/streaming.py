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
import uuid
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


def _empty_usage() -> dict:
    """Return a zeroed usage accumulator dict."""
    return {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
    }


def _accumulate_usage(usage_total: dict, usage: dict | None) -> None:
    """Add token counts from usage into usage_total in-place; None is a no-op."""
    if not usage:
        return
    for k in usage_total:
        usage_total[k] += int(usage.get(k, 0) or 0)


async def _handle_stream_event(msg, blocks: list, seen_subagents: set) -> AsyncIterator[bytes]:
    """Yield SSE frames for a StreamEvent message."""
    ev = msg.event or {}
    etype = ev.get("type")
    parent = getattr(msg, "parent_tool_use_id", None)
    if etype == "message_start" and parent and parent not in seen_subagents:
        seen_subagents.add(parent)
        payload = {"kind": "subagent_start", "parent": parent,
                   "model": (ev.get("message") or {}).get("model")}
        blocks.append(payload)
        yield _sse("subagent_start", payload)
        return
    if etype != "content_block_delta":
        return
    sub = "subagent" if parent else None
    delta = ev.get("delta") or {}
    if delta.get("type") == "text_delta" and delta.get("text"):
        yield _sse("text", {"kind": "text", "subagent": sub, "text": delta["text"]})
    elif delta.get("type") == "thinking_delta" and delta.get("thinking"):
        yield _sse("thinking", {"kind": "thinking", "subagent": sub, "text": delta["thinking"]})


async def _handle_tool_result_blocks(
    tool_result_blocks, blocks: list, subagent_marker
) -> AsyncIterator[bytes]:
    """Yield tool_result and card SSE frames for a list of ToolResultBlock objects."""
    for block in tool_result_blocks:
        text = _content_text(block.content)
        payload = {"kind": "tool_result", "subagent": subagent_marker,
                   "id": block.tool_use_id, "is_error": bool(block.is_error), "text": text}
        blocks.append(payload)
        yield _sse("tool_result", payload)
        for card in _user_context.take_cards():
            card_payload = {"kind": "card", "type": card.get("type"),
                            "data": card.get("data"), "tool": card.get("tool")}
            blocks.append(card_payload)
            yield _sse("card", card_payload)


async def _handle_result_message(msg, usage_total: dict, final_session_id) -> tuple:
    """Accumulate usage from ResultMessage and return (usage_frame, updated_session_id)."""
    if msg.session_id:
        final_session_id = msg.session_id
    _accumulate_usage(usage_total, msg.usage)
    frame = _sse("usage", {
        "input_tokens": usage_total["input_tokens"],
        "output_tokens": usage_total["output_tokens"],
        "cache_read_input_tokens": usage_total["cache_read_input_tokens"],
        "cache_creation_input_tokens": usage_total["cache_creation_input_tokens"],
        "cost_usd": msg.total_cost_usd,
        "duration_ms": msg.duration_ms,
    })
    return frame, final_session_id


async def _persist_turn(session, blocks: list, usage_total: dict, final_session_id) -> str | None:
    """Persist the assistant turn to the database and return the new ChatMessage id."""
    joined_text = "\n".join(b["text"] for b in blocks if b.get("kind") == "text" and b.get("text"))

    @sync_to_async
    def _save():
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
            session.save(update_fields=["updated_at"])
        return str(msg.id)

    return await _save()


def _process_content_block(block, blocks: list, subagent_marker, frames: list) -> None:
    """Append block to transcript and push SSE frames for tool_use and tool_result blocks."""
    if isinstance(block, TextBlock):
        blocks.append({"kind": "text", "subagent": subagent_marker, "text": block.text})
    elif isinstance(block, ThinkingBlock):
        blocks.append({"kind": "thinking", "subagent": subagent_marker, "text": block.thinking})
    elif isinstance(block, ToolUseBlock):
        _user_context.take_cards()
        payload = {"kind": "tool_use", "subagent": subagent_marker,
                   "tool": block.name, "input": block.input, "id": block.id}
        blocks.append(payload)
        frames.append(_sse("tool_use", payload))
    elif isinstance(block, ToolResultBlock):
        text = _content_text(block.content)
        payload = {"kind": "tool_result", "subagent": subagent_marker,
                   "id": block.tool_use_id, "is_error": bool(block.is_error), "text": text}
        blocks.append(payload)
        frames.append(_sse("tool_result", payload))
        for card in _user_context.take_cards():
            card_payload = {"kind": "card", "type": card.get("type"),
                            "data": card.get("data"), "tool": card.get("tool")}
            blocks.append(card_payload)
            frames.append(_sse("card", card_payload))


async def _process_assistant_message(
    msg, blocks: list, seen_subagents: set, usage_total: dict, final_session_id
) -> tuple:
    """Process an AssistantMessage: accumulate usage, announce new subagents, emit content frames."""
    if msg.session_id:
        final_session_id = msg.session_id
    _accumulate_usage(usage_total, msg.usage)
    subagent_marker = "subagent" if _is_subagent(msg) else None
    frames: list[bytes] = []
    if _is_subagent(msg) and msg.parent_tool_use_id not in seen_subagents:
        seen_subagents.add(msg.parent_tool_use_id)
        payload = {"kind": "subagent_start", "parent": msg.parent_tool_use_id, "model": msg.model}
        blocks.append(payload)
        frames.append(_sse("subagent_start", payload))
    for block in msg.content:
        _process_content_block(block, blocks, subagent_marker, frames)
    return final_session_id, frames


async def _dispatch_session(
    user, session, prompt: str, blocks: list, seen_subagents: set,
    usage_total: dict, final_session_id_ref: list,
) -> AsyncIterator[bytes]:
    """Drive run_chat_session and fan out SSE frames; stores final_session_id in ref[0]."""
    try:
        async for msg in run_chat_session(
            user=user, sdk_session_id=session.sdk_session_id, prompt=prompt
        ):
            if isinstance(msg, StreamEvent):
                async for frame in _handle_stream_event(msg, blocks, seen_subagents):
                    yield frame
                continue
            if isinstance(msg, AssistantMessage):
                final_session_id_ref[0], frames = await _process_assistant_message(
                    msg, blocks, seen_subagents, usage_total, final_session_id_ref[0]
                )
                for frame in frames:
                    yield frame
            elif isinstance(msg, UserMessage):
                subagent_marker = "subagent" if _is_subagent(msg) else None
                result_blocks = [b for b in msg.content if isinstance(b, ToolResultBlock)]
                async for frame in _handle_tool_result_blocks(result_blocks, blocks, subagent_marker):
                    yield frame
            elif isinstance(msg, ResultMessage):
                frame, final_session_id_ref[0] = await _handle_result_message(
                    msg, usage_total, final_session_id_ref[0]
                )
                yield frame
        yield _sse("assistant_end", {})
    except Exception:
        error_id = uuid.uuid4().hex[:8]
        log.exception("chat stream error [%s]", error_id)
        yield _sse("error", {"message": f"An internal error occurred (ref {error_id})."})


async def stream_chat(
    *, user, session: ChatSession, prompt: str
) -> AsyncIterator[bytes]:
    """Stream one assistant turn over SSE and persist the assistant message at end."""
    _user_context.reset_cards()
    blocks: list[dict] = []
    seen_subagents: set[str] = set()
    final_session_id_ref = [session.sdk_session_id or None]
    usage_total = _empty_usage()

    yield _sse("assistant_start", {"session_id": str(session.id)})

    async for frame in _dispatch_session(
        user, session, prompt, blocks, seen_subagents, usage_total, final_session_id_ref
    ):
        yield frame

    persisted_message_id = None
    try:
        persisted_message_id = await _persist_turn(
            session, blocks, usage_total, final_session_id_ref[0]
        )
    except Exception:
        log.exception("failed to persist assistant turn")
    yield _sse("done", {"session_id": str(session.id),
                        "sdk_session_id": final_session_id_ref[0],
                        "message_id": persisted_message_id})

"""Chat views: session CRUD + an SSE streaming endpoint for messages."""

from __future__ import annotations

import asyncio
import logging

from asgiref.sync import async_to_sync
from django.core.cache import cache
from django.http import JsonResponse, StreamingHttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response


# ---------------------------------------------------------------------------
# Rate limiting helper
# ---------------------------------------------------------------------------
# django-ratelimit's decorator does not support async or DRF action views
# reliably, so we use a lightweight cache-based counter instead.
# Django defaults to LocMemCache (per-process in-memory) when no CACHES is
# configured; this deployment runs a single backend container so per-process
# is sufficient — for multi-process deployments swap CACHES to Redis/Memcache.
def _rate_limited(user_id, limit: int = 10, window_seconds: int = 60) -> bool:
    """Sliding-window-ish counter: True if the user exceeded `limit` sends per window."""
    key = f"chat_send_rl:{user_id}"
    current = cache.get_or_set(key, 0, timeout=window_seconds)
    if current >= limit:
        return True
    try:
        cache.incr(key)
    except ValueError:  # key expired between get_or_set and incr
        cache.set(key, 1, timeout=window_seconds)
    return False


class ServerSentEventRenderer(BaseRenderer):
    media_type = "text/event-stream"
    format = "sse"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


from .models import ChatMessage, ChatSession, Notebook, NotebookCell, SavedAnalysis
from .serializers import (
    ChatMessageSerializer, ChatSessionSerializer, NotebookSerializer,
    NotebookCellSerializer, SavedAnalysisSerializer, SavedAnalysisListSerializer,
)
from .services.analysis_capture import build_draft
from .services.saved_match import match_saved_analyses
from .streaming import stream_chat

log = logging.getLogger(__name__)


def _sse_response(gen) -> StreamingHttpResponse:
    """Wrap an SSE frame generator in a properly configured StreamingHttpResponse."""
    response = StreamingHttpResponse(gen, content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


def _command_frames(session, reply: str):
    """Yield SSE frames for a deterministic slash-command reply."""
    from chat.streaming import _sse
    yield _sse("assistant_start", {"session_id": str(session.id)})
    yield _sse("text", {"kind": "text", "subagent": None, "text": reply})
    yield _sse("assistant_end", {})
    yield _sse("done", {"session_id": str(session.id), "sdk_session_id": session.sdk_session_id or None})


def _persist_command_exchange(session, prompt: str, reply: str) -> None:
    """Persist both sides of a slash-command exchange and bump session.updated_at."""
    ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_USER, text=prompt)
    ChatMessage.objects.create(
        session=session, role=ChatMessage.ROLE_ASSISTANT, text=reply,
        blocks=[{"kind": "text", "subagent": None, "text": reply}],
    )
    session.save(update_fields=["updated_at"])


def _auto_title(session, prompt: str) -> None:
    """Set session title from the first message if it is still the default."""
    if not session.title or session.title == "New chat":
        session.title = prompt[:60]
        session.save(update_fields=["title"])


def _byte_iter(user, session, prompt: str):
    """Bridge the async SSE generator into a synchronous byte iterator."""
    agen = stream_chat(user=user, session=session, prompt=prompt)
    loop = asyncio.new_event_loop()
    try:
        while True:
            try:
                chunk = loop.run_until_complete(agen.__anext__())
            except StopAsyncIteration:
                break
            yield chunk
    finally:
        try:
            loop.run_until_complete(agen.aclose())
        except Exception:  # pylint: disable=broad-except
            pass
        loop.close()


class ChatSessionViewSet(viewsets.ModelViewSet):
    serializer_class = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user).order_by("-updated_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        """Return the persisted transcript for a session."""
        session = self.get_object()
        msgs = session.messages.all().order_by("created_at")
        return Response(ChatMessageSerializer(msgs, many=True).data)

    @action(detail=True, methods=["post"], url_path="add_message")
    def add_message(self, request, pk=None):
        """Add a manual message to the session."""
        session = self.get_object()
        role = request.data.get("role", ChatMessage.ROLE_USER)
        text = request.data.get("text") or request.data.get("content") or ""
        msg = ChatMessage.objects.create(session=session, role=role, text=text)
        return Response(ChatMessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="send", renderer_classes=[ServerSentEventRenderer])
    def send(self, request, pk=None):
        """Persist the user's message and stream the assistant's reply over SSE.

        Body: ``{"prompt": "..."}``
        Response: ``text/event-stream`` (see chat.streaming for the frame format).
        """
        session = self.get_object()
        prompt = (request.data.get("prompt") or "").strip()
        if not prompt:
            return Response({"detail": "prompt is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Deterministic slash commands run before the rate limiter — they are cheap.
        from chat.commands import handle_command, parse_command
        command = parse_command(prompt)
        if command is not None:
            reply = handle_command(request.user, command)
            _persist_command_exchange(session, prompt, reply)
            return _sse_response(_command_frames(session, reply))

        if _rate_limited(request.user.id):
            return JsonResponse({"error": "Rate limit exceeded. Try again in a minute."}, status=429)

        # Persist user turn before streaming so it survives client disconnects.
        ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_USER, text=prompt)
        _auto_title(session, prompt)

        # Notebook cells never resume an SDK session — start fresh each time.
        if session.is_notebook:
            session.sdk_session_id = ""

        return _sse_response(_byte_iter(request.user, session, prompt))

    @action(detail=True, methods=["post"], url_path="bookmark_draft")
    def bookmark_draft(self, request, pk=None):
        """Build an editable SavedAnalysis draft from a single message (or the session)."""
        session = self.get_object()  # 404 if not owned by request.user
        message = None
        message_id = request.data.get("message_id")
        if message_id:
            message = session.messages.filter(id=message_id).first()
            if message is None:
                return Response(
                    {"detail": "Message not found in this session."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        draft = build_draft(session, message=message)
        draft["session"] = str(session.id)
        if message is not None:
            draft["source_message"] = str(message.id)
        return Response(draft)


class NotebookViewSet(viewsets.ModelViewSet):
    serializer_class = NotebookSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notebook.objects.filter(user=self.request.user).order_by("-updated_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class NotebookCellViewSet(viewsets.ModelViewSet):
    serializer_class = NotebookCellSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = NotebookCell.objects.filter(notebook__user=self.request.user).order_by("order")
        notebook_id = self.request.query_params.get("notebook")
        if notebook_id:
            try:
                queryset = queryset.filter(notebook_id=notebook_id)
            except ValueError:
                pass
        return queryset

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=False, methods=["post"], url_path="sync")
    def sync(self, request):
        """Bulk synchronize prompt cells, orderings, and outputs for the user's notebook."""
        notebook_id = request.query_params.get("notebook")
        if not notebook_id:
            return Response({"detail": "notebook query parameter is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            notebook = Notebook.objects.get(id=notebook_id, user=self.request.user)
        except (Notebook.DoesNotExist, ValueError):
            return Response({"detail": "Notebook not found"}, status=status.HTTP_404_NOT_FOUND)
        cell_ids = [self._upsert_cell(notebook, index, data) for index, data in enumerate(request.data)]
        NotebookCell.objects.filter(notebook=notebook).exclude(id__in=cell_ids).delete()
        queryset = self.get_queryset().filter(notebook=notebook)
        return Response(NotebookCellSerializer(queryset, many=True).data)

    def _upsert_cell(self, notebook, index: int, data: dict):
        """Upsert a single cell by ID or create it; return the cell pk."""
        cell_id = data.get("id")
        prompt = data.get("prompt", "")
        execution_count = data.get("execution_count")
        outputs = data.get("outputs", [])
        cell = self._update_existing_cell(cell_id, notebook, prompt, index, execution_count, outputs)
        if not cell:
            cell = NotebookCell.objects.create(
                notebook=notebook, prompt=prompt, order=index,
                execution_count=execution_count, outputs=outputs,
            )
        return cell.id

    @staticmethod
    def _update_existing_cell(cell_id, notebook, prompt, index, execution_count, outputs):
        """Update an existing cell if it exists; return it or None."""
        if not cell_id:
            return None
        try:
            cell = NotebookCell.objects.get(id=cell_id, notebook=notebook)
            cell.prompt = prompt
            cell.order = index
            cell.execution_count = execution_count
            cell.outputs = outputs
            cell.save()
            return cell
        except (NotebookCell.DoesNotExist, ValueError):
            return None


class SavedAnalysisViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "list":
            return SavedAnalysisListSerializer
        return SavedAnalysisSerializer

    def get_queryset(self):
        qs = SavedAnalysis.objects.filter(user=self.request.user)
        params = self.request.query_params
        if params.get("ticker"):
            qs = qs.filter(tickers__contains=[params["ticker"].upper()])
        if params.get("category"):
            qs = qs.filter(category=params["category"])
        if params.get("tag"):
            qs = qs.filter(tags__contains=[params["tag"]])
        if params.get("series_key"):
            qs = qs.filter(series_key=params["series_key"])
        if params.get("session"):
            qs = qs.filter(session=params["session"])
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="suggest")
    def suggest(self, request):
        """Fast lexical match for the composer hint."""
        q = request.query_params.get("q", "")
        matches = match_saved_analyses(request.user, q, limit=5)
        return Response(SavedAnalysisListSerializer(matches, many=True).data)


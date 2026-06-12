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
        msg = ChatMessage.objects.create(
            session=session,
            role=role,
            text=text,
        )
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

        # Deterministic slash commands (/memory, /help) are handled server-side
        # without the LLM: persist the pair and stream the reply directly. This
        # runs BEFORE the rate limiter (commands are cheap) and the SDK path, and
        # persists its OWN user message (so the normal user-persist below is skipped).
        from chat.commands import handle_command, parse_command

        command = parse_command(prompt)
        if command is not None:
            reply = handle_command(request.user, command)
            ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_USER, text=prompt)
            ChatMessage.objects.create(
                session=session, role=ChatMessage.ROLE_ASSISTANT, text=reply,
                blocks=[{"kind": "text", "subagent": None, "text": reply}],
            )
            session.save(update_fields=["updated_at"])

            from chat.streaming import _sse

            def command_frames():
                yield _sse("assistant_start", {"session_id": str(session.id)})
                yield _sse("text", {"kind": "text", "subagent": None, "text": reply})
                yield _sse("assistant_end", {})
                yield _sse("done", {"session_id": str(session.id),
                                    "sdk_session_id": session.sdk_session_id or None})

            response = StreamingHttpResponse(command_frames(), content_type="text/event-stream")
            response["Cache-Control"] = "no-cache"
            response["X-Accel-Buffering"] = "no"
            return response

        # Rate limit: 10 messages per minute per user.
        if _rate_limited(request.user.id):
            return JsonResponse(
                {"error": "Rate limit exceeded. Try again in a minute."},
                status=429,
            )

        # Persist the user turn before streaming so it survives client disconnects.
        ChatMessage.objects.create(
            session=session, role=ChatMessage.ROLE_USER, text=prompt
        )
        # Auto-title from the first message.
        if not session.title or session.title == "New chat":
            session.title = prompt[:60]
            session.save(update_fields=["title"])

        # Bridge the async SSE generator into Django's sync streaming response.
        user = request.user

        # Notebook cells are independent queries — never resume an SDK session.
        # Each cell run starts fresh so stale/expired sessions can't cause failures.
        if session.title.startswith("Notebook Session:"):
            session.sdk_session_id = ""

        def byte_iter():
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

        response = StreamingHttpResponse(byte_iter(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response

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

        cell_ids = []
        for index, data in enumerate(request.data):
            cell_id = data.get("id")
            prompt = data.get("prompt", "")
            execution_count = data.get("execution_count")
            outputs = data.get("outputs", [])

            cell = None
            if cell_id:
                try:
                    cell = NotebookCell.objects.get(id=cell_id, notebook=notebook)
                    cell.prompt = prompt
                    cell.order = index
                    cell.execution_count = execution_count
                    cell.outputs = outputs
                    cell.save()
                except (NotebookCell.DoesNotExist, ValueError):
                    pass

            if not cell:
                cell = NotebookCell.objects.create(
                    notebook=notebook,
                    prompt=prompt,
                    order=index,
                    execution_count=execution_count,
                    outputs=outputs,
                )
            cell_ids.append(cell.id)

        # Clean up any deleted cells for this specific notebook
        NotebookCell.objects.filter(notebook=notebook).exclude(id__in=cell_ids).delete()

        queryset = self.get_queryset().filter(notebook=notebook)
        return Response(NotebookCellSerializer(queryset, many=True).data)


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
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="suggest")
    def suggest(self, request):
        """Fast lexical match for the composer hint."""
        q = request.query_params.get("q", "")
        matches = match_saved_analyses(request.user, q, limit=5)
        return Response(SavedAnalysisListSerializer(matches, many=True).data)


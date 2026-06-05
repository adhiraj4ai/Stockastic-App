"""Chat views: session CRUD + an SSE streaming endpoint for messages."""

from __future__ import annotations

import asyncio
import logging

from asgiref.sync import async_to_sync
from django.http import StreamingHttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response


class ServerSentEventRenderer(BaseRenderer):
    media_type = "text/event-stream"
    format = "sse"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


from .models import ChatMessage, ChatSession, Notebook, NotebookCell
from .serializers import ChatMessageSerializer, ChatSessionSerializer, NotebookSerializer, NotebookCellSerializer
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


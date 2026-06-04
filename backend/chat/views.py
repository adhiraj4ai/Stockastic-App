"""Chat views: session CRUD + an SSE streaming endpoint for messages."""

from __future__ import annotations

import asyncio
import logging

from asgiref.sync import async_to_sync
from django.http import StreamingHttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import ChatMessage, ChatSession
from .serializers import ChatMessageSerializer, ChatSessionSerializer
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

    @action(detail=True, methods=["post"], url_path="send")
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

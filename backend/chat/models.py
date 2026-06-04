import uuid
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class ChatSession(models.Model):
    """A multi-turn conversation between a user and the Stockastic agent."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_sessions")
    title = models.CharField(max_length=255, default="New chat")
    # Claude Agent SDK session ID — set after the first turn so subsequent turns can resume.
    sdk_session_id = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.user.username} · {self.title}"


class ChatMessage(models.Model):
    """One user or assistant turn. Assistant turns carry the full structured block stream."""

    ROLE_USER = "user"
    ROLE_ASSISTANT = "assistant"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=16, choices=[(ROLE_USER, "user"), (ROLE_ASSISTANT, "assistant")])

    # Plain-text summary of the message — used by the message list preview and search.
    text = models.TextField(blank=True, default="")

    # Ordered list of typed blocks produced during the turn.
    blocks = models.JSONField(default=list, blank=True)

    # Token usage attributed to this assistant turn (zero for user turns).
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    cache_read_tokens = models.IntegerField(default=0)
    cache_creation_tokens = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["session", "created_at"]),
        ]

    def __str__(self) -> str:
        preview = (self.text or "")[:60]
        return f"{self.role}: {preview}"

import uuid
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class ChatSession(models.Model):
    """A multi-turn conversation between a user and the Stockastic agent."""

    # Notebook cells run in dedicated sessions titled with this prefix. They use
    # the fast single-agent path and never resume a prior SDK session.
    NOTEBOOK_SESSION_PREFIX = "Notebook Session:"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_sessions")
    title = models.CharField(max_length=255, default="New chat")
    # Claude Agent SDK session ID — set after the first turn so subsequent turns can resume.
    sdk_session_id = models.CharField(max_length=64, blank=True, default="")
    # Rolling natural-language summary of the conversation, refreshed asynchronously
    # after each turn and injected into every prompt so the agent keeps the thread.
    summary = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.user.username} · {self.title}"

    @property
    def is_notebook(self) -> bool:
        """True for sessions backing a notebook cell run."""
        return (self.title or "").startswith(self.NOTEBOOK_SESSION_PREFIX)


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


class Notebook(models.Model):
    """A collection of notebook cells persisted to the database."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notebooks")
    title = models.CharField(max_length=255, default="Untitled Notebook")
    description = models.TextField(blank=True, default="")
    color = models.CharField(max_length=32, default="slate", blank=True)
    icon = models.CharField(max_length=64, default="file-text", blank=True)
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.user.username} · {self.title}"


class NotebookCell(models.Model):
    """A cell in the user's daily question notebook, persisted to the database."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notebook = models.ForeignKey(Notebook, on_delete=models.CASCADE, related_name="cells", null=True, blank=True)
    prompt = models.TextField(blank=True, default="")
    order = models.PositiveIntegerField(default=0)
    execution_count = models.IntegerField(null=True, blank=True)
    outputs = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order"]

    def __str__(self) -> str:
        preview = (self.prompt or "")[:60]
        notebook_title = self.notebook.title if self.notebook else "Orphaned"
        return f"{notebook_title} · [{self.order}] · {preview}"


class UserMemory(models.Model):
    """A short durable fact about the user, written by chat tools and injected
    into every turn's prompt. Hard-capped per user (MAX_FACTS_PER_USER)."""

    MAX_FACTS_PER_USER = 30

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_memories")
    content = models.CharField(max_length=220)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.user_id}: {self.content[:40]}"


class SavedAnalysis(models.Model):
    """A frozen, tagged snapshot of a chat analysis the agent can recall later."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_analyses")
    # Link to the originating transcript; SET_NULL so deleting the chat keeps the snapshot.
    session = models.ForeignKey(
        ChatSession, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="saved_analyses",
    )
    # The specific assistant turn this snapshot was captured from. SET_NULL keeps the
    # snapshot if the message is deleted; a partial unique constraint (below) blocks
    # bookmarking the same message twice.
    source_message = models.ForeignKey(
        ChatMessage, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    title = models.CharField(max_length=255)
    summary = models.TextField()                       # frozen synthesis (markdown)
    one_liner = models.CharField(max_length=280, blank=True, default="")
    category = models.CharField(max_length=64, blank=True, default="")
    tags = models.JSONField(default=list, blank=True)
    tickers = models.JSONField(default=list, blank=True)
    series_key = models.CharField(max_length=128, blank=True, default="", db_index=True)
    verdict = models.CharField(max_length=16, blank=True, default="")
    structured = models.JSONField(default=dict, blank=True)  # captured verdict/signal card data
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "series_key", "created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "source_message"],
                condition=models.Q(source_message__isnull=False),
                name="uniq_saved_analysis_per_message",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user.username} · {self.title}"



class CompanyAnalysisEntry(models.Model):
    """One point in a user's evolving AI analysis of a NEPSE company. The most
    recent entry per (user, symbol) is the current view; older entries are frozen
    milestones forming a timeline."""

    STANCE_BULLISH = "bullish"
    STANCE_NEUTRAL = "neutral"
    STANCE_BEARISH = "bearish"
    STANCE_CHOICES = [
        (STANCE_BULLISH, "Bullish"),
        (STANCE_NEUTRAL, "Neutral"),
        (STANCE_BEARISH, "Bearish"),
    ]

    ASPECT_TECHNICAL = "technical"
    ASPECT_FUNDAMENTAL = "fundamental"
    ASPECT_BOTH = "both"
    ASPECT_CHOICES = [
        (ASPECT_TECHNICAL, "Technical"),
        (ASPECT_FUNDAMENTAL, "Fundamental"),
        (ASPECT_BOTH, "Both"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="company_analysis_entries"
    )
    symbol = models.CharField(max_length=20, db_index=True)
    summary = models.TextField(blank=True, default="")
    stance = models.CharField(max_length=8, choices=STANCE_CHOICES, default=STANCE_NEUTRAL)
    aspect = models.CharField(max_length=12, choices=ASPECT_CHOICES, default=ASPECT_BOTH)
    change_note = models.CharField(max_length=240, blank=True, default="")
    source_message = models.ForeignKey(
        "ChatMessage", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "symbol", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.symbol}@{self.created_at:%Y-%m-%d}"


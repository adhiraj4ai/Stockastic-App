from rest_framework import serializers
from .models import ChatMessage, ChatSession, Notebook, NotebookCell, SavedAnalysis


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = [
            "id",
            "role",
            "text",
            "blocks",
            "input_tokens",
            "output_tokens",
            "cache_read_tokens",
            "cache_creation_tokens",
            "created_at",
        ]
        read_only_fields = fields


class ChatSessionSerializer(serializers.ModelSerializer):
    message_count = serializers.IntegerField(source="messages.count", read_only=True)

    class Meta:
        model = ChatSession
        fields = ["id", "title", "created_at", "updated_at", "message_count"]
        read_only_fields = ["id", "created_at", "updated_at", "message_count"]


class NotebookSerializer(serializers.ModelSerializer):
    cell_count = serializers.IntegerField(source="cells.count", read_only=True)

    class Meta:
        model = Notebook
        fields = ["id", "title", "description", "color", "icon", "tags", "created_at", "updated_at", "cell_count"]
        read_only_fields = ["id", "created_at", "updated_at", "cell_count"]


class NotebookCellSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotebookCell
        fields = ["id", "notebook", "prompt", "order", "execution_count", "outputs", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class SavedAnalysisSerializer(serializers.ModelSerializer):
    # The verbatim Q&A this snapshot was captured from (read-only; null if the
    # source message was since deleted). Lets the detail view show the real answer
    # alongside the AI summary.
    source_question = serializers.SerializerMethodField()
    source_answer = serializers.SerializerMethodField()

    class Meta:
        model = SavedAnalysis
        fields = [
            "id", "session", "source_message", "source_question", "source_answer",
            "title", "summary", "one_liner",
            "category", "tags", "tickers", "series_key", "verdict", "structured",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "source_question", "source_answer", "created_at", "updated_at"]

    def get_source_answer(self, obj) -> str:
        return obj.source_message.text if obj.source_message_id else ""

    def get_source_question(self, obj) -> str:
        msg = obj.source_message
        if not msg or not msg.session_id:
            return ""
        prev = (
            ChatMessage.objects
            .filter(session_id=msg.session_id, role=ChatMessage.ROLE_USER, created_at__lt=msg.created_at)
            .order_by("created_at")
            .last()
        )
        return prev.text if prev else ""

    def validate_session(self, value):
        """Only allow linking to a session the requesting user owns (or none)."""
        if value is not None:
            request = self.context.get("request")
            if request is not None and value.user_id != request.user.id:
                raise serializers.ValidationError("Session not found.")
        return value

    def validate_source_message(self, value):
        """Only allow linking to a message in a session the requesting user owns."""
        if value is not None:
            request = self.context.get("request")
            if request is not None and value.session.user_id != request.user.id:
                raise serializers.ValidationError("Message not found.")
        return value

    def validate(self, attrs):
        """Block bookmarking the same message twice (mirrors the DB constraint with a clean error)."""
        request = self.context.get("request")
        message = attrs.get("source_message")
        if request is not None and message is not None:
            dupe = SavedAnalysis.objects.filter(
                user=request.user, source_message=message,
            )
            if self.instance is not None:
                dupe = dupe.exclude(pk=self.instance.pk)
            if dupe.exists():
                raise serializers.ValidationError(
                    {"source_message": "This answer is already bookmarked."}
                )
        return attrs


class SavedAnalysisListSerializer(serializers.ModelSerializer):
    """Lightweight catalog representation — omits the full summary body."""

    class Meta:
        model = SavedAnalysis
        fields = [
            "id", "session", "source_message", "title", "one_liner", "category",
            "tags", "tickers", "series_key", "verdict", "created_at",
        ]
        read_only_fields = fields


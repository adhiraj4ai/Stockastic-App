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
    class Meta:
        model = SavedAnalysis
        fields = [
            "id", "session", "title", "summary", "one_liner", "category",
            "tags", "tickers", "series_key", "verdict", "structured",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_session(self, value):
        """Only allow linking to a session the requesting user owns (or none)."""
        if value is not None:
            request = self.context.get("request")
            if request is not None and value.user_id != request.user.id:
                raise serializers.ValidationError("Session not found.")
        return value


class SavedAnalysisListSerializer(serializers.ModelSerializer):
    """Lightweight catalog representation — omits the full summary body."""

    class Meta:
        model = SavedAnalysis
        fields = [
            "id", "session", "title", "one_liner", "category",
            "tags", "tickers", "series_key", "verdict", "created_at",
        ]
        read_only_fields = fields


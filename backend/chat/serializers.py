from rest_framework import serializers
from .models import ChatMessage, ChatSession, Notebook, NotebookCell


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


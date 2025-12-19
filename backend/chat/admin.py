from django.contrib import admin
from .models import ChatSession, ChatMessage

@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'title', 'created_at', 'updated_at')
    search_fields = ('title', 'user__username')
    list_filter = ('created_at', 'updated_at')

@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'session', 'role', 'timestamp')
    search_fields = ('content', 'role')
    list_filter = ('role', 'timestamp')

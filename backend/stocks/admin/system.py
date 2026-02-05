from django.contrib import admin
from ..models.system import DataUploadLog, Notification

@admin.register(DataUploadLog)
class DataUploadLogAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'upload_type', 'status', 'records_count', 'created_at')
    list_filter = ('upload_type', 'status')

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'type', 'read', 'created_at')
    list_filter = ('type', 'read')
    search_fields = ('user__username', 'title')

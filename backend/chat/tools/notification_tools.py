from typing import Dict, Any, List
from .base import BaseTool, ToolParameter


class GetNotificationsTool(BaseTool):
    """Get user notifications"""
    
    @property
    def name(self) -> str:
        return "get_notifications"
    
    @property
    def description(self) -> str:
        return "Get user's notifications and alerts"
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="unread_only", type="boolean", description="Show only unread notifications", required=False),
            ToolParameter(name="limit", type="number", description="Maximum number of notifications", required=False),
        ]
    
    def execute(self, user, unread_only: bool = False, limit: int = 20) -> Dict[str, Any]:
        from stocks.models import Notification
        
        queryset = Notification.objects.filter(user=user)
        
        if unread_only:
            queryset = queryset.filter(read=False)
        
        notifications = list(queryset.order_by('-created_at')[:limit].values(
            'id', 'title', 'message', 'type', 'ticker', 'read', 'created_at', 'redirect_url'
        ))
        
        # Convert datetimes
        for notif in notifications:
            notif['created_at'] = notif['created_at'].isoformat()
        
        return {
            "notifications": notifications,
            "count": len(notifications),
            "unread_count": Notification.objects.filter(user=user, read=False).count()
        }

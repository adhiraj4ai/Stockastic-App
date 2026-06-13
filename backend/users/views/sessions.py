"""Session management views: list, revoke single, revoke all."""
import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import LoginActivity, UserSession
from .session_helpers import _blacklist_session_token, _get_current_jti

logger = logging.getLogger(__name__)


def _serialize_session(session, current_jti: str) -> dict:
    return {
        'id': session.id,
        'device': session.device,
        'browser': session.browser,
        'os': session.os,
        'ip_address': session.ip_address,
        'location': session.location,
        'is_current': session.session_key == current_jti if current_jti else False,
        'created_at': session.created_at.isoformat(),
        'last_active': session.last_active.isoformat(),
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_sessions(request):
    """List all active sessions for the current user."""
    sessions = UserSession.objects.filter(user=request.user)
    current_jti = _get_current_jti(request)
    result = [_serialize_session(s, current_jti) for s in sessions]
    return Response({'sessions': result, 'count': len(result)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def revoke_session(request, session_id):
    """Revoke a specific session by ID."""
    try:
        session = UserSession.objects.get(id=session_id, user=request.user)
    except UserSession.DoesNotExist:
        return Response({"error": "Session not found"}, status=404)

    _blacklist_session_token(session.session_key)
    session.delete()
    logger.info("Session %s revoked for user %s", session_id, request.user.username)
    return Response({"message": "Session revoked successfully"})


def _revoke_queryset(sessions) -> None:
    """Blacklist JWT tokens and delete all sessions in the queryset."""
    for s in sessions:
        _blacklist_session_token(s.session_key)
    sessions.delete()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def revoke_all_sessions(request):
    """Revoke all sessions except the current one."""
    current_jti = _get_current_jti(request)
    sessions = UserSession.objects.filter(user=request.user)
    if current_jti:
        sessions = sessions.exclude(session_key=current_jti)
    count = sessions.count()
    _revoke_queryset(sessions)
    logger.info("Revoked %d sessions for user %s", count, request.user.username)
    return Response({"message": f"{count} session(s) revoked", "revoked_count": count})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def login_activity(request):
    """Fetch the user's recent login activity."""
    activities = LoginActivity.objects.filter(user=request.user)[:20]
    result = [
        {
            'status': a.status,
            'ip_address': a.ip_address,
            'user_agent': a.user_agent,
            'timestamp': a.timestamp.isoformat(),
            'location': a.location,
        }
        for a in activities
    ]
    return Response({'activity': result})

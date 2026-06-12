from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChatSessionViewSet, NotebookCellViewSet, NotebookViewSet, SavedAnalysisViewSet

router = DefaultRouter()
router.register('sessions', ChatSessionViewSet, basename='chat-session')
router.register('notebooks', NotebookViewSet, basename='notebook')
router.register('notebook-cells', NotebookCellViewSet, basename='notebook-cell')
router.register('saved', SavedAnalysisViewSet, basename='saved-analysis')

urlpatterns = [
    path('', include(router.urls)),
]


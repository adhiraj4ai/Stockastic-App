from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ForecastViewSet, ForecastRecommendationViewSet, TrainingJobViewSet

router = DefaultRouter()
router.register(r'forecasts', ForecastViewSet, basename='forecast')
router.register(r'training-jobs', TrainingJobViewSet, basename='training-job')
router.register(r'recommendations', ForecastRecommendationViewSet, basename='forecast-recommendation')

urlpatterns = [
    path('', include(router.urls)),
]

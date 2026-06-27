from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from stocks.services.signals.glossary import GLOSSARY


@api_view(["GET"])
@permission_classes([AllowAny])
def signal_glossary(request):
    """Plain-language labels + descriptions for signal sources, tiers, and terms."""
    return Response(GLOSSARY)

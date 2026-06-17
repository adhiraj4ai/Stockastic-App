from __future__ import annotations


class TearsheetError(Exception):
    """Base error for the nepsealpha tearsheet scraper."""


class TearsheetAuthError(TearsheetError):
    """Login failed or the session is not authenticated."""


class TearsheetUnavailableError(TearsheetError):
    """Cloudflare not cleared, navigation timeout, or transport failure."""


class TearsheetSchemaError(TearsheetError):
    """Response failed validation or contained an unmapped line item."""

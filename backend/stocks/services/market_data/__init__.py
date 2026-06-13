"""Market-data ingestion: anti-corruption layer over external NEPSE data providers.

The rest of Stockastic depends only on the canonical DTOs and the
``MarketDataProvider`` interface defined in ``contracts``. Provider-specific
knowledge lives entirely in ``providers/``. Swap providers via ``factory.get_provider``.
"""

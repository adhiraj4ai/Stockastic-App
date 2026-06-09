# backend/stocks/tests/conftest.py
"""Test fixtures for the stocks app.

DailyStockPrice (and the other market.py models) are Meta.managed = False —
they map to externally-managed tables that Django's test runner never creates.
Tests that insert price rows need the table to exist, so we create it once per
session via the schema editor. Per-test DML is still rolled back by the normal
`db` transaction; only the table DDL persists for the session.
"""
import pytest


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    from django.db import connection
    from stocks.models.market import DailyStockPrice

    with django_db_blocker.unblock():
        existing = connection.introspection.table_names()
        if DailyStockPrice._meta.db_table not in existing:
            with connection.schema_editor() as schema_editor:
                schema_editor.create_model(DailyStockPrice)
    yield
